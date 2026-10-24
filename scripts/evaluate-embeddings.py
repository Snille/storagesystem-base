"""Offline, pinned dense retrieval comparison. Real inputs/results stay under data/.

Downloads public model weights; never uploads inventory or calls an inference API.
No application configuration, inventory write, service, or production change.
"""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import time

os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN'] = '1'
os.environ['HF_HUB_DISABLE_PROGRESS_BARS'] = '1'
os.environ['TOKENIZERS_PARALLELISM'] = 'false'

MODELS = {
    'e5-small': ('intfloat/multilingual-e5-small', '614241f622f53c4eeff9890bdc4f31cfecc418b3', 384, 512, 'query: ', 'passage: '),
    'bge-m3': ('BAAI/bge-m3', '5617a9f61b028005a4858fdac845db406aefb181', 1024, 8192, '', ''),
}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def save(path, value):
    with Path(path).open('x', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write('\n')


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def ranking_metrics(rows, questions):
    answers = [(r, q) for r, q in zip(rows, questions) if q['expected']['kind'] == 'answer']
    ranks = [next((i + 1 for i, m in enumerate(r['matches'])
                   if m['boxId'] in q['expected']['acceptableBoxIds']), None) for r, q in answers]
    return {'answerCases': len(answers), 'top1Correct': sum(r == 1 for r in ranks),
            'top5Hit': sum(r is not None and r <= 5 for r in ranks)}


def decide(row, threshold, margin):
    if row['similarity'] < threshold:
        return 'no_supported_match'
    if row['margin'] < margin:
        return 'clarify'
    return 'answer'


def policy_metrics(rows, questions, decisions):
    confusion = {kind: {p: 0 for p in ['answer', 'clarify', 'no_supported_match']}
                 for kind in ['answer', 'clarify', 'no_supported_match']}
    correct = wrong = answered = correct_answers = 0
    for row, question, predicted in zip(rows, questions, decisions):
        expected = question['expected']
        confusion[expected['kind']][predicted] += 1
        valid = expected['kind'] == 'answer' and row['matches'][0]['boxId'] in expected['acceptableBoxIds']
        if predicted == 'answer':
            answered += 1
            wrong += not valid
            correct_answers += valid
        correct += (valid if predicted == 'answer' else predicted == expected['kind'])
    return {'correctDecisions': int(correct), 'confidentAnswers': answered,
            'correctAnswers': int(correct_answers), 'incorrectConfidentAnswers': int(wrong), 'confusion': confusion}


def calibrate(rows, questions):
    # Only training score boundaries; never use the held-out group's labels or scores.
    thresholds = sorted({-1.01, 1.01, *(r['similarity'] for r in rows),
                         *(r['similarity'] + 1e-7 for r in rows)})
    margins = sorted({-2.01, 2.01, *(r['margin'] for r in rows),
                      *(r['margin'] + 1e-7 for r in rows)})
    best = None
    for threshold in thresholds:
        for margin in margins:
            decisions = [decide(r, threshold, margin) for r in rows]
            metrics = policy_metrics(rows, questions, decisions)
            key = (-metrics['incorrectConfidentAnswers'], metrics['correctDecisions'],
                   metrics['correctAnswers'], threshold, margin)
            if best is None or key > best[0]:
                best = (key, threshold, margin)
    return best[1:]


def grouped_policy(rows, questions):
    predictions = [None] * len(questions)
    folds = []
    for group in sorted({q['groupId'] for q in questions}):
        train = [i for i, q in enumerate(questions) if q['groupId'] != group]
        test = [i for i, q in enumerate(questions) if q['groupId'] == group]
        threshold, margin = calibrate([rows[i] for i in train], [questions[i] for i in train])
        for i in test:
            predictions[i] = decide(rows[i], threshold, margin)
        folds.append({'heldOutGroup': group, 'trainIds': [questions[i]['id'] for i in train],
                      'testIds': [questions[i]['id'] for i in test], 'similarityThreshold': threshold, 'marginThreshold': margin})
    return {'method': 'leave-one-group-out; minimize training incorrect confident answers first, then maximize correct decisions and answers; conservative tie-break',
            'metrics': policy_metrics(rows, questions, predictions),
            'predictions': dict(zip([q['id'] for q in questions], predictions)), 'folds': folds,
            'limitation': 'Exploratory cross-validation with only six non-answer cases; no independent holdout, speech runtime or production thresholds.'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('directory', type=Path)
    parser.add_argument('--model', choices=MODELS, required=True)
    parser.add_argument('--threads', type=int, default=8)
    args = parser.parse_args()
    root = args.directory.resolve()
    # Fix the model cache inside ignored data, independently of user-wide HF settings.
    os.environ['HF_HOME'] = str(root.parent / 'model-cache')
    import numpy as np
    import torch
    from sentence_transformers import SentenceTransformer
    torch.set_num_threads(args.threads)
    torch.set_num_interop_threads(1)
    torch.manual_seed(0)
    dataset = load(root / 'questions-v1.reviewed.json')
    corpus = load(root / 'search-corpus.json')
    lexical = load(root / 'lexical-top25.json')
    assert dataset['status'] == 'user_reviewed_frozen'
    assert dataset['source']['corpusSha256'] == sha(root / 'search-corpus.json') == lexical['corpusSha256']
    assert lexical['datasetSha256'] == sha(root / 'questions-v1.reviewed.json')
    assert dataset['source']['inventorySha256'] == sha(root / 'inventory.json')
    assert len({d['boxId'] for d in corpus}) == len(corpus)
    assert all(d['textSha256'] == hashlib.sha256(d['text'].encode()).hexdigest() for d in corpus)
    questions = dataset['questions']
    assert [q['id'] for q in questions] == [r['id'] for r in lexical['results']]
    name, revision, dimension, max_tokens, query_prefix, passage_prefix = MODELS[args.model]
    output = root / ('comparison-' + args.model + '-v1.json')
    if output.exists():
        raise FileExistsError(output)
    source_bytes = Path(__file__).read_bytes()
    source_sha = hashlib.sha256(source_bytes).hexdigest()
    source_archive = root / ('evaluate-embeddings-' + source_sha + '.py')
    if source_archive.exists():
        assert source_archive.read_bytes() == source_bytes
    else:
        with source_archive.open('xb') as stream:
            stream.write(source_bytes)
    print(f'Loading {name} at {revision}', flush=True)
    start = time.perf_counter()
    model = SentenceTransformer(name, revision=revision, device='cpu', trust_remote_code=False,
                                model_kwargs={'use_safetensors': args.model != 'bge-m3'})
    load_seconds = time.perf_counter() - start
    model.max_seq_length = max_tokens
    texts = [passage_prefix + d['text'] for d in corpus]
    lengths = [len(model.tokenizer(t, truncation=False)['input_ids']) for t in texts]
    query_texts = [query_prefix + q['query'] for q in questions]
    query_lengths = [len(model.tokenizer(t, truncation=False)['input_ids']) for t in query_texts]
    start = time.perf_counter()
    documents = model.encode(texts, batch_size=8, normalize_embeddings=True, show_progress_bar=False,
                             convert_to_numpy=True).astype(np.float32)
    corpus_seconds = time.perf_counter() - start
    assert documents.shape == (len(corpus), dimension) and np.isfinite(documents).all()
    print(f'Corpus embedded in {corpus_seconds:.2f}s; max tokens {max(lengths)}; truncated {sum(n > max_tokens for n in lengths)}', flush=True)
    # Warm the single-query path. Each measured query is encoded separately.
    model.encode([query_prefix + 'warmup'], normalize_embeddings=True, show_progress_bar=False)
    semantic, hybrid, query_vectors = [], [], []
    doc_index = {d['boxId']: i for i, d in enumerate(corpus)}
    for question, query, lex in zip(questions, query_texts, lexical['results']):
        start = time.perf_counter()
        vector = model.encode([query], normalize_embeddings=True, show_progress_bar=False)[0]
        query_vectors.append(vector)
        scores = documents @ vector
        order = sorted(range(len(corpus)), key=lambda i: (-float(scores[i]), corpus[i]['boxId']))
        def matches(indices, hybrid_scores=None):
            return [dict(boxId=corpus[i]['boxId'], locationId=corpus[i]['locationId'],
                         similarity=float(scores[i]), **({'rrfScore': hybrid_scores[i]} if hybrid_scores else {})) for i in indices]
        sem = {'id': question['id'], 'matches': matches(order), 'similarity': float(scores[order[0]]),
               'margin': float(scores[order[0]] - scores[order[1]]), 'latencyMs': (time.perf_counter() - start) * 1000}
        # Predeclared equal-weight reciprocal-rank fusion, k=60, top-25 per source.
        fusion_start = time.perf_counter()
        fused = {}
        for ranking in [order[:25], [doc_index[m['boxId']] for m in lex['matches']]]:
            for rank, i in enumerate(ranking, 1):
                fused[i] = fused.get(i, 0.0) + 1 / (60 + rank)
        fused_order = sorted(fused, key=lambda i: (-fused[i], corpus[i]['boxId']))
        hyb = {'id': question['id'], 'matches': matches(fused_order, fused),
               'similarity': float(scores[fused_order[0]]),
               'margin': float(scores[fused_order[0]] - scores[fused_order[1]]),
               'latencyMs': sem['latencyMs'] + lex['latencyMs'] + (time.perf_counter() - fusion_start) * 1000}
        semantic.append(sem)
        hybrid.append(hyb)
    def timings(rows):
        values = [r['latencyMs'] for r in rows]
        return {'p50Ms': float(np.percentile(values, 50)), 'p95Ms': float(np.percentile(values, 95)), 'maxMs': max(values)}
    report = {
        'createdAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'model': {'name': name, 'revision': revision, 'dimensions': dimension, 'maxTokens': max_tokens,
                  'queryPrefix': query_prefix, 'passagePrefix': passage_prefix, 'license': 'MIT',
                  'parameters': sum(p.numel() for p in model.parameters()), 'dtype': str(next(model.parameters()).dtype)},
        'runtime': {'python': platform.python_version(), 'platform': platform.platform(), 'device': 'cpu',
                    'threads': args.threads, 'packages': {p: importlib.metadata.version(p) for p in
                    ['torch', 'sentence-transformers', 'transformers', 'numpy', 'huggingface-hub', 'tokenizers', 'safetensors']}},
        'sourceHashes': {f: sha(root / f) for f in ['inventory.json', 'search-corpus.json', 'questions-v1.reviewed.json', 'lexical-top25.json']},
        'scriptSha256': source_sha, 'lexicalCodeHashes': lexical['codeSha256'],
        'tokenization': {'documentTokenLengths': dict(zip([d['boxId'] for d in corpus], lengths)),
                         'truncatedDocuments': sum(n > max_tokens for n in lengths), 'truncatedQueries': sum(n > max_tokens for n in query_lengths)},
        'timing': {'loadIncludingDownloadSeconds': load_seconds, 'corpusEncodeSeconds': corpus_seconds,
                   'lexical': timings(lexical['results']), 'semantic': timings(semantic), 'hybridSequentialEstimate': timings(hybrid),
                   'scope': 'Warm in-process CPU tokenization+query encoding+cosine+ranking. Hybrid adds measured shared lexical and fusion time sequentially. Excludes HTTP, STT, TTS, network and model load.'},
        'retrieval': {'lexical': ranking_metrics(lexical['results'], questions),
                      'semantic': ranking_metrics(semantic, questions), 'hybrid': ranking_metrics(hybrid, questions)},
        'hybridMethod': 'Equal-weight RRF k=60, top-25 per source, no label-driven tuning; lexical is the existing shared Inventory.search, not BM25.',
        'policy': {'semantic': grouped_policy(semantic, questions), 'hybrid': grouped_policy(hybrid, questions)},
        'results': {'semantic': semantic, 'hybrid': hybrid},
        'limitations': ['User-reviewed exploratory set, no independent holdout.', 'No production endpoint or speech integration tested.',
                        'Full unchanged corpus includes current photo interpretations; no question-specific synonyms or document enrichment.',
                        'Dense BGE-M3 only; native sparse/multivector retrieval and reranking are not evaluated.'],
    }
    vector_path = root / ('vectors-' + args.model + '-v1.npz')
    with vector_path.open('xb') as stream:
        np.savez_compressed(stream, documents=documents, queries=np.array(query_vectors, dtype=np.float32))
    report['vectorSha256'] = sha(vector_path)
    save(output, report)
    print(json.dumps({'model': name, 'retrieval': report['retrieval'], 'timing': report['timing'],
                      'policy': {k: v['metrics'] for k, v in report['policy'].items()}}, indent=2), flush=True)


if __name__ == '__main__':
    main()
