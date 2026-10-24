"""Query a frozen endpoint with new source-derived cases, without tuning policy.

Source-derived checks are not independent human-labelled acceptance.
Results stay private under the supplied evaluation directory.
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('directory', type=Path)
    parser.add_argument('--secrets-file', type=Path)
    parser.add_argument('--audit', type=Path)
    args = parser.parse_args()
    root = args.directory.resolve()
    case_root = root / 'acceptance-v3'
    dataset = evaluation.load(case_root / 'questions.json')
    freeze = evaluation.load(case_root / 'freeze.json')
    assert dataset['status'] == 'source_evidence_frozen'
    assert all(evaluation.sha(Path(name)) == digest for name, digest in freeze['codeHashes'].items())
    for name, key in [('search-corpus.json', 'corpusSha256'), ('inventory.json', 'inventorySha256')]:
        assert evaluation.sha(root / name) == dataset['source'][key]
    if args.audit:
        report = evaluation.load(args.audit / 'report.json')
        assert all(evaluation.sha(root / name) == digest for name, digest in report['sourceHashes'].items())
        assert evaluation.sha(args.audit / 'evaluator.py') == report['scriptSha256']
        assert evaluation.sha(args.audit / 'queries.npz') == report['vectorSha256']
        with np.load(args.audit / 'queries.npz', allow_pickle=False) as vectors:
            queries = vectors['queries']
        with np.load(root / 'ollama-20261022T210450Z/vectors.npz', allow_pickle=False) as vectors:
            documents = vectors['documents']
        assert queries.shape == (len(dataset['questions']), 1024) and np.isfinite(queries).all()
        assert np.allclose(np.linalg.norm(queries, axis=1), 1, atol=1e-5)
        corpus = evaluation.load(root / 'search-corpus.json')
        rows = endpoint.ranked(corpus, documents, queries, dataset['questions'], report['latencyMs'])
        assert rows == report['results']
        print('AUDIT PASS: frozen policy, frozen source/labels, archived evaluator, vector hash/normalization, all rankings and destinations reproduce.')
        return
    if not args.secrets_file:
        parser.error('--secrets-file is required for live requests')
    baseline = evaluation.load(root / 'ollama-20261022T210450Z/report.json')
    assert baseline['sourceHashes']['search-corpus.json'] == dataset['source']['corpusSha256']
    assert evaluation.sha(root / 'ollama-20261022T210450Z/vectors.npz') == baseline['vectorSha256']
    output = case_root / ('endpoint-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()))
    output.mkdir()
    (output / 'evaluator.py').write_bytes(Path(__file__).read_bytes())
    source_names = ['acceptance-v3/questions.json', 'acceptance-v3/freeze.json',
                    'search-corpus.json', 'inventory.json', 'ollama-20261022T210450Z/vectors.npz']
    source_hashes = {name: evaluation.sha(root / name) for name in source_names}
    evaluation.save(output / 'preflight.json', {'sourceHashes': source_hashes, 'frozenPolicy': freeze['codeHashes']})
    secrets = dict(line.split('=', 1) for line in args.secrets_file.read_text(encoding='utf-8-sig').splitlines()
                   if '=' in line and not line.lstrip().startswith('#'))
    key = secrets['STORAGESYSTEM_API_KEY'].strip().strip('\"\'')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), endpoint.NoRedirect())

    def embed(text):
        req = urllib.request.Request('http://10.0.0.47:11434/v1/embeddings',
            data=json.dumps({'model': 'bge-m3:cpu4', 'input': [text]}).encode('utf-8'),
            headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key})
        start = time.perf_counter()
        with opener.open(req, timeout=60) as response:
            raw = response.read(1024 * 1024 + 1)
            assert len(raw) <= 1024 * 1024
            data = json.loads(raw)
        assert len(data['data']) == 1 and data['data'][0]['index'] == 0
        vector = np.array(data['data'][0]['embedding'], dtype=np.float32)
        assert vector.shape == (1024,) and np.isfinite(vector).all()
        assert np.isclose(np.linalg.norm(vector), 1, atol=1e-5)
        return vector, (time.perf_counter() - start) * 1000

    corpus = evaluation.load(root / 'search-corpus.json')
    with np.load(root / 'ollama-20261022T210450Z/vectors.npz', allow_pickle=False) as vectors:
        documents = vectors['documents']
    sentinel, _ = embed(corpus[0]['text'])
    assert float(documents[0] @ sentinel) > 0.99999
    queries, latencies = [], []
    for question in dataset['questions']:
        vector, ms = embed(question['query'])
        queries.append(vector)
        latencies.append(ms)
    queries = np.array(queries, dtype=np.float32)
    rows = endpoint.ranked(corpus, documents, queries, dataset['questions'], latencies)
    with (output / 'queries.npz').open('xb') as stream:
        np.savez_compressed(stream, queries=queries)
    report = {'sourceHashes': source_hashes, 'scriptSha256': evaluation.sha(output / 'evaluator.py'),
              'vectorSha256': evaluation.sha(output / 'queries.npz'), 'results': rows,
              'latencyMs': latencies, 'timing': {'p50Ms': float(np.percentile(latencies, 50)),
                'p95Ms': float(np.percentile(latencies, 95)), 'maxMs': max(latencies)},
              'limitations': dataset['limitations']}
    evaluation.save(output / 'report.json', report)
    print(json.dumps({'output': str(output), 'queries': len(rows), 'timing': report['timing']}, indent=2))


if __name__ == '__main__':
    main()
