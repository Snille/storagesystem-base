"""Evaluate an explicitly selected LAN endpoint against the frozen private corpus.

Writes only a new ignored result directory. Never changes application settings.
Uses the existing offline evaluator's ranking and grouped decision methods.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import time
import urllib.error
import urllib.request

import numpy as np

spec = importlib.util.spec_from_file_location('evaluation', Path(__file__).with_name('evaluate-embeddings.py'))
evaluation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evaluation)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def ranked(corpus, documents, queries, questions, latencies):
    rows = []
    for question, vector, latency in zip(questions, queries, latencies):
        scores = documents @ vector
        order = sorted(range(len(corpus)), key=lambda i: (-float(scores[i]), corpus[i]['boxId']))
        rows.append({'id': question['id'], 'similarity': float(scores[order[0]]),
                     'margin': float(scores[order[0]] - scores[order[1]]), 'latencyMs': latency,
                     'matches': [{'boxId': corpus[i]['boxId'], 'locationId': corpus[i]['locationId'],
                                  'similarity': float(scores[i])} for i in order]})
    return rows


def transferred_policy(rows, questions, baseline):
    # Transfer each original held-out fold unchanged: no label-based retuning.
    predictions = []
    for row, question in zip(rows, questions):
        fold = next(f for f in baseline['policy']['semantic']['folds']
                    if f['heldOutGroup'] == question['groupId'])
        predictions.append(evaluation.decide(row, fold['similarityThreshold'], fold['marginThreshold']))
    return evaluation.policy_metrics(rows, questions, predictions)


def audit(root, output):
    report = evaluation.load(output / 'report.json')
    assert all(evaluation.sha(root / name) == digest for name, digest in report['sourceHashes'].items())
    assert evaluation.sha(output / 'evaluator.py') == report['scriptSha256']
    assert evaluation.sha(output / 'offline-evaluator.py') == report['offlineScriptSha256']
    assert evaluation.sha(output / 'vectors.npz') == report['vectorSha256']
    corpus = evaluation.load(root / 'search-corpus.json')
    questions = evaluation.load(root / 'questions-v1.reviewed.json')['questions']
    baseline = evaluation.load(root / 'comparison-bge-m3-v1.json')
    with np.load(output / 'vectors.npz', allow_pickle=False) as vectors:
        documents, queries = vectors['documents'], vectors['queries']
    for matrix, count in [(documents, len(corpus)), (queries, len(questions))]:
        assert matrix.shape == (count, 1024) and np.isfinite(matrix).all()
        assert np.allclose(np.linalg.norm(matrix, axis=1), 1, atol=1e-5)
    rows = ranked(corpus, documents, queries, questions, report['queryLatencyMs'])
    assert rows == report['results']
    assert evaluation.ranking_metrics(rows, questions) == report['retrieval']
    assert evaluation.grouped_policy(rows, questions) == report['policy']
    assert transferred_policy(rows, questions, baseline) == report['originalThresholdPolicy']
    assert report['sourceHashes'] == {name: evaluation.sha(root / name) for name in report['sourceHashes']}
    print('AUDIT PASS: frozen hashes, archived evaluators, vectors, all rankings/destinations, metrics and grouped policies', flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('directory', type=Path)
    parser.add_argument('--secrets-file', type=Path)
    parser.add_argument('--base-url', default='http://10.0.0.47:11434/v1')
    parser.add_argument('--model', default='bge-m3:cpu4')
    parser.add_argument('--audit', type=Path)
    args = parser.parse_args()
    root = args.directory.resolve()
    if args.audit:
        audit(root, args.audit)
        return
    if not args.secrets_file:
        parser.error('--secrets-file is required for live evaluation')
    secrets = dict(line.split('=', 1) for line in args.secrets_file.read_text(encoding='utf-8-sig').splitlines()
                   if line.strip() and not line.lstrip().startswith('#') and '=' in line)
    key = secrets['STORAGESYSTEM_API_KEY'].strip().strip('\"\'')
    assert key
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def request(path, payload=None, authenticated=True):
        headers = {'Content-Type': 'application/json'}
        if authenticated:
            headers['Authorization'] = 'Bearer ' + key
        body = None if payload is None else json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(args.base_url.rstrip('/') + path, data=body, headers=headers)
        start = time.perf_counter()
        try:
            with opener.open(req, timeout=60) as response:
                data = response.read(8 * 1024 * 1024 + 1)
                assert len(data) <= 8 * 1024 * 1024
                return response.status, json.loads(data), (time.perf_counter() - start) * 1000
        except urllib.error.HTTPError as error:
            return error.code, None, (time.perf_counter() - start) * 1000

    def embed(texts):
        status, data, ms = request('/embeddings', {'model': args.model, 'input': texts})
        if status != 200:
            raise RuntimeError(f'Embedding request failed: HTTP {status}; response body withheld')
        entries = sorted(data['data'], key=lambda row: row['index'])
        assert [row['index'] for row in entries] == list(range(len(texts)))
        matrix = np.array([row['embedding'] for row in entries], dtype=np.float32)
        assert matrix.shape == (len(texts), 1024) and np.isfinite(matrix).all()
        norms = np.linalg.norm(matrix, axis=1)
        assert np.allclose(norms, 1, atol=1e-5), 'Endpoint vectors must already be normalized'
        return matrix, ms, data.get('usage')

    dataset = evaluation.load(root / 'questions-v1.reviewed.json')
    corpus = evaluation.load(root / 'search-corpus.json')
    baseline = evaluation.load(root / 'comparison-bge-m3-v1.json')
    assert dataset['status'] == 'user_reviewed_frozen'
    source_names = ['inventory.json', 'search-corpus.json', 'questions-v1.reviewed.json',
                    'lexical-top25.json', 'comparison-bge-m3-v1.json', 'vectors-bge-m3-v1.npz']
    source_hashes = {name: evaluation.sha(root / name) for name in source_names}
    assert all(source_hashes[name] == digest for name, digest in baseline['sourceHashes'].items())
    assert dataset['source']['corpusSha256'] == source_hashes['search-corpus.json']
    assert dataset['source']['inventorySha256'] == source_hashes['inventory.json']
    assert all(d['textSha256'] == hashlib.sha256(d['text'].encode()).hexdigest() for d in corpus)
    output = root / ('ollama-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()))
    output.mkdir()
    (output / 'evaluator.py').write_bytes(Path(__file__).read_bytes())
    (output / 'offline-evaluator.py').write_bytes(Path(evaluation.__file__).read_bytes())
    status, models, _ = request('/models')
    assert status == 200 and args.model in [row['id'] for row in models['data']]
    unauthenticated, _, _ = request('/models', authenticated=False)
    assert unauthenticated == 401
    _, warmup_ms, _ = embed(['Storage System endpoint evaluation warmup'])
    chunks, batches = [], []
    start = time.perf_counter()
    for offset in range(0, len(corpus), 8):
        matrix, ms, usage = embed([d['text'] for d in corpus[offset:offset + 8]])
        chunks.append(matrix)
        batches.append({'offset': offset, 'count': len(matrix), 'latencyMs': ms, 'usage': usage})
        print(f'Documents {min(offset + 8, len(corpus))}/{len(corpus)}: {ms:.0f} ms', flush=True)
    corpus_seconds = time.perf_counter() - start
    documents = np.concatenate(chunks)
    questions = dataset['questions']
    queries, latencies = [], []
    for index, question in enumerate(questions):
        matrix, ms, _ = embed([question['query']])
        queries.append(matrix[0])
        latencies.append(ms)
        if (index + 1) % 10 == 0:
            print(f'Questions {index + 1}/{len(questions)}', flush=True)
    queries = np.array(queries, dtype=np.float32)
    rows = ranked(corpus, documents, queries, questions, latencies)
    # Repeat the longest real document independently to detect batch-dependent loss.
    longest = max(range(len(corpus)), key=lambda i: len(corpus[i]['text']))
    repeated, long_ms, long_usage = embed([corpus[longest]['text']])
    long_check = {'boxId': corpus[longest]['boxId'], 'characters': len(corpus[longest]['text']),
                  'latencyMs': long_ms, 'usage': long_usage,
                  'batchVsSingleCosine': float(documents[longest] @ repeated[0])}
    # Synthetic context probes reveal truncation/limits, without touching the corpus.
    from transformers import AutoTokenizer
    tokenizer = AutoTokenizer.from_pretrained(
        str(root.parent / 'model-cache/hub/models--BAAI--bge-m3/snapshots' / evaluation.MODELS['bge-m3'][1]),
        local_files_only=True, trust_remote_code=False)
    token_lengths = [len(tokenizer(d['text'], truncation=False)['input_ids']) for d in corpus]
    probes, probe_vectors = [], {}
    for words in [1000, 2046, 2047, 2048, 2049, 3900, 4300]:
        text = ' '.join(['ord'] * words)
        status, data, ms = request('/embeddings', {'model': args.model, 'input': [text]})
        probes.append({'repeatedWords': words, 'httpStatus': status, 'latencyMs': ms,
                       'localTokenizerTokens': len(tokenizer(text, truncation=False)['input_ids']),
                       'usage': data.get('usage') if status == 200 else None})
        if status == 200:
            probe_vectors[words] = np.array(data['data'][0]['embedding'], dtype=np.float32)
    changed_tail = ' '.join(['ord'] * 2048 + ['different inventory contents'] * 600)
    tail_vector, _, tail_usage = embed([changed_tail])
    truncation = {'longVs2046MaxComponentDifference': float(np.max(np.abs(probe_vectors[3900] - probe_vectors[2046]))),
                  'longVs2047MaxComponentDifference': float(np.max(np.abs(probe_vectors[3900] - probe_vectors[2047]))),
                  'longVs2048MaxComponentDifference': float(np.max(np.abs(probe_vectors[3900] - probe_vectors[2048]))),
                  'changedTailVsLongMaxComponentDifference': float(np.max(np.abs(tail_vector[0] - probe_vectors[3900]))),
                  'changedTailUsage': tail_usage}
    with np.load(root / 'vectors-bge-m3-v1.npz', allow_pickle=False) as old:
        cosine = np.sum(documents * old['documents'], axis=1)
        query_cosine = np.sum(queries * old['queries'], axis=1)
    changed = [q['id'] for q, row, old in zip(questions, rows, baseline['results']['semantic'])
               if row['matches'][0]['boxId'] != old['matches'][0]['boxId']]
    with (output / 'vectors.npz').open('xb') as stream:
        np.savez_compressed(stream, documents=documents, queries=queries)
    report = {'createdAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
              'endpoint': args.base_url, 'model': args.model, 'modelCatalog': models,
              'sourceHashes': source_hashes, 'scriptSha256': evaluation.sha(output / 'evaluator.py'),
              'offlineScriptSha256': evaluation.sha(output / 'offline-evaluator.py'),
              'vectorSha256': evaluation.sha(output / 'vectors.npz'),
              'authentication': {'missingKeyStatus': unauthenticated},
              'timing': {'warmupMs': warmup_ms, 'corpusSeconds': corpus_seconds,
                         'queryP50Ms': float(np.percentile(latencies, 50)),
                         'queryP95Ms': float(np.percentile(latencies, 95)), 'queryMaxMs': max(latencies),
                         'scope': 'Sequential authenticated LAN HTTP, excluding local ranking and STT/TTS.'},
              'queryLatencyMs': latencies, 'corpusBatches': batches,
              'longestDocument': long_check, 'syntheticContextProbes': probes,
              'tokenization': {'source': 'Pinned local Hugging Face BGE-M3 tokenizer; Ollama tokenization may differ',
                               'maximumCorpusTokens': max(token_lengths),
                               'documentsAbove2048Tokens': sum(n > 2048 for n in token_lengths)},
              'truncationProbe': truncation,
              'baselineComparison': {'changedTop1Ids': changed,
                                     'documentCosineMin': float(min(cosine)),
                                     'documentCosineMedian': float(np.median(cosine)),
                                     'queryCosineMin': float(min(query_cosine))},
              'retrieval': evaluation.ranking_metrics(rows, questions),
              'policy': evaluation.grouped_policy(rows, questions),
              'originalThresholdPolicy': transferred_policy(rows, questions, baseline), 'results': rows,
              'limitations': ['Frozen exploratory set, not an untouched acceptance set.',
                              'Different runtime/artifact; thresholds are not assumed portable.',
                              'No app integration, speech, concurrency or failure-recovery acceptance.']}
    evaluation.save(output / 'report.json', report)
    audit(root, output)
    print(json.dumps({'output': str(output), 'retrieval': report['retrieval'],
                      'policy': report['policy']['metrics'], 'originalThresholdPolicy': report['originalThresholdPolicy'],
                      'timing': report['timing'], 'comparison': report['baselineComparison'],
                      'longestDocument': long_check, 'contextProbes': probes,
                      'tokenization': report['tokenization'], 'truncationProbe': truncation}, indent=2), flush=True)


if __name__ == '__main__':
    main()
