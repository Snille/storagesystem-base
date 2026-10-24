"""Prospective user queries: frozen prior-only policy, unchanged corpus/vectors.

Private labels and results stay under ignored data. No application writes.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import time
import urllib.request

import numpy as np

spec = importlib.util.spec_from_file_location('endpoint', Path(__file__).with_name('evaluate-ollama.py'))
endpoint = importlib.util.module_from_spec(spec)
spec.loader.exec_module(endpoint)
evaluation = endpoint.evaluation


def score(root, output):
    report = evaluation.load(output / 'report.json')
    for name, digest in report['sourceHashes'].items():
        assert evaluation.sha(root / name) == digest
    for name, digest in report['artifactHashes'].items():
        assert evaluation.sha(output / name) == digest
    questions = evaluation.load(root / 'questions-v2.user-reviewed.json')['questions']
    corpus = evaluation.load(root / 'search-corpus.json')
    training = evaluation.load(root / 'questions-v1.reviewed.json')['questions']
    baseline = evaluation.load(root / 'ollama-20261022T210450Z/report.json')
    threshold, margin = evaluation.calibrate(baseline['results'], training)
    assert report['fixedPolicy'] == {'similarityThreshold': threshold, 'marginThreshold': margin,
                                    'trainingDataset': 'questions-v1.reviewed.json', 'trainingCases': len(training)}
    with np.load(output / 'queries.npz', allow_pickle=False) as vectors:
        queries = vectors['queries']
    with np.load(root / 'ollama-20261022T210450Z/vectors.npz', allow_pickle=False) as vectors:
        documents = vectors['documents']
    assert queries.shape == (20, 1024) and np.isfinite(queries).all()
    assert np.allclose(np.linalg.norm(queries, axis=1), 1, atol=1e-5)
    rows = endpoint.ranked(corpus, documents, queries, questions, report['latencyMs'])
    assert rows == report['results']
    predictions = [evaluation.decide(row, threshold, margin) for row in rows]
    assert predictions == report['predictions']
    preflight = evaluation.load(output / 'preflight.json')
    assert preflight['sourceHashes'] == report['sourceHashes'] and preflight['fixedPolicy'] == report['fixedPolicy']
    assert evaluation.policy_metrics(rows, questions, predictions) == report['decisionMetrics']
    assert evaluation.ranking_metrics(rows, questions) == report['retrieval']['semantic']
    lexical = evaluation.load(root / 'lexical-user-v2.json')
    assert lexical['datasetSha256'] == report['sourceHashes']['questions-v2.user-reviewed.json']
    assert evaluation.ranking_metrics(lexical['results'], questions) == report['retrieval']['lexical']
    assert report['dualDestinationRetrieval'] == [
        {'id': q['id'], 'allRequiredInTop5': set(q['expected']['requiredMentionBoxIds']) <= {m['boxId'] for m in row['matches'][:5]},
         'speechVerified': False}
        for q, row in zip(questions, rows) if q['expected'].get('requiredMentionBoxIds')]
    print('AUDIT PASS: frozen inputs, archived sources, finite normalized vectors, rankings and prior-only policy', flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('directory', type=Path)
    parser.add_argument('--secrets-file', type=Path)
    parser.add_argument('--audit', type=Path)
    args = parser.parse_args()
    root = args.directory.resolve()
    if args.audit:
        score(root, args.audit)
        return
    assert args.secrets_file, '--secrets-file required for live requests'
    dataset = evaluation.load(root / 'questions-v2.user-reviewed.json')
    assert dataset['status'] == 'user_reviewed_frozen'
    corpus = evaluation.load(root / 'search-corpus.json')
    questions = dataset['questions']
    baseline = evaluation.load(root / 'ollama-20261022T210450Z/report.json')
    training = evaluation.load(root / 'questions-v1.reviewed.json')['questions']
    names = ['inventory.json', 'search-corpus.json', 'questions-v1.reviewed.json',
             'questions-v2.user-reviewed.json', 'lexical-user-v2.json',
             'ollama-20261022T210450Z/report.json', 'ollama-20261022T210450Z/vectors.npz']
    hashes = {name: evaluation.sha(root / name) for name in names}
    for name in ['inventory.json', 'search-corpus.json', 'questions-v1.reviewed.json']:
        assert hashes[name] == baseline['sourceHashes'][name]
    assert hashes['inventory.json'] == dataset['source']['inventorySha256']
    assert hashes['search-corpus.json'] == dataset['source']['corpusSha256']
    for q in questions:
        assert q['reviewStatus'] == 'accepted_by_user'
        for e in q['evidence']:
            d = next(d for d in corpus if d['boxId'] == e['boxId'])
            assert all(e[k] == d[k] for k in ['locationId', 'textSha256', 'sessionId'])
        for e in q['expected'].get('destinations', []):
            assert next(d for d in corpus if d['boxId'] == e['boxId'])['locationId'] == e['locationId']
    threshold, margin = evaluation.calibrate(baseline['results'], training)
    output = root / ('user-ollama-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()))
    output.mkdir()
    for filename, source in [('evaluator.py', Path(__file__)), ('endpoint-evaluator.py', Path(endpoint.__file__)),
                              ('offline-evaluator.py', Path(evaluation.__file__))]:
        (output / filename).write_bytes(source.read_bytes())
    fixed = {'similarityThreshold': threshold, 'marginThreshold': margin,
             'trainingDataset': 'questions-v1.reviewed.json', 'trainingCases': len(training)}
    evaluation.save(output / 'preflight.json', {'createdBeforeInference': True, 'sourceHashes': hashes, 'fixedPolicy': fixed})
    secrets = dict(line.split('=', 1) for line in args.secrets_file.read_text(encoding='utf-8-sig').splitlines()
                   if '=' in line and not line.lstrip().startswith('#'))
    key = secrets['STORAGESYSTEM_API_KEY'].strip().strip('\"\'')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), endpoint.NoRedirect())

    def embed(text):
        body = json.dumps({'model': 'bge-m3:cpu4', 'input': [text]}).encode('utf-8')
        req = urllib.request.Request('http://10.0.0.47:11434/v1/embeddings', data=body,
                                     headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key})
        start = time.perf_counter()
        with opener.open(req, timeout=60) as response:
            data = response.read(1024 * 1024 + 1)
            assert len(data) <= 1024 * 1024
            data = json.loads(data)
        assert len(data['data']) == 1 and data['data'][0]['index'] == 0
        vector = np.array(data['data'][0]['embedding'], dtype=np.float32)
        assert vector.shape == (1024,) and np.isfinite(vector).all()
        assert np.isclose(np.linalg.norm(vector), 1, atol=1e-5)
        return vector, (time.perf_counter() - start) * 1000

    with np.load(root / 'ollama-20261022T210450Z/vectors.npz', allow_pickle=False) as vectors:
        documents = vectors['documents']
    # Verify the active endpoint still matches the saved document artifact.
    probe, _ = embed(corpus[0]['text'])
    probe_cosine = float(probe @ documents[0])
    assert probe_cosine > 0.99999
    query_vectors, latency = [], []
    for q in questions:
        vector, ms = embed(q['query'])
        query_vectors.append(vector)
        latency.append(ms)
    queries = np.array(query_vectors, dtype=np.float32)
    rows = endpoint.ranked(corpus, documents, queries, questions, latency)
    predictions = [evaluation.decide(row, threshold, margin) for row in rows]
    lexical = evaluation.load(root / 'lexical-user-v2.json')
    with (output / 'queries.npz').open('xb') as stream:
        np.savez_compressed(stream, queries=queries)
    artifact_names = ['evaluator.py', 'endpoint-evaluator.py', 'offline-evaluator.py', 'queries.npz', 'preflight.json']
    report = {'sourceHashes': hashes, 'artifactHashes': {name: evaluation.sha(output / name) for name in artifact_names},
              'fixedPolicy': fixed, 'endpointProbeCosine': probe_cosine,
              'retrieval': {'semantic': evaluation.ranking_metrics(rows, questions),
                            'lexical': evaluation.ranking_metrics(lexical['results'], questions)},
              'decisionMetrics': evaluation.policy_metrics(rows, questions, predictions),
              'results': rows, 'predictions': predictions, 'latencyMs': latency,
              'timing': {'p50Ms': float(np.percentile(latency, 50)), 'p95Ms': float(np.percentile(latency, 95)), 'maxMs': max(latency)},
              'dualDestinationRetrieval': [
                  {'id': q['id'], 'allRequiredInTop5': set(q['expected']['requiredMentionBoxIds']) <= {m['boxId'] for m in row['matches'][:5]},
                   'speechVerified': False}
                  for q, row in zip(questions, rows) if q['expected'].get('requiredMentionBoxIds')],
              'limitations': ['Some semantic topics overlap training.', 'No unseen unsupported cases; only one clarification case.',
                              'Dual-destination speech not implemented or verified; decision metrics score candidate selection only.',
                              'Written query robustness, not measured audio/STT.', 'No application activation or inventory/settings changes.']}
    evaluation.save(output / 'report.json', report)
    score(root, output)
    print(json.dumps({'output': str(output), 'fixedPolicy': fixed, 'retrieval': report['retrieval'],
                      'decisions': report['decisionMetrics'], 'timing': report['timing'],
                      'dualDestinationRetrieval': report['dualDestinationRetrieval'],
                      'cases': [{'id': q['id'], 'query': q['query'], 'top1': row['matches'][0]['boxId'],
                                 'prediction': pred, 'expected': q['expected']['kind'],
                                 'correctTop1': row['matches'][0]['boxId'] in q['expected'].get('acceptableBoxIds', [])}
                                for q, row, pred in zip(questions, rows, predictions)]}, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
