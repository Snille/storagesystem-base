"""Recompute metrics, rankings and group isolation from private saved vectors."""
import argparse
import importlib.util
import json
from pathlib import Path
import numpy as np

spec = importlib.util.spec_from_file_location('evaluation', Path(__file__).with_name('evaluate-embeddings.py'))
evaluation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evaluation)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('directory', type=Path)
    args = parser.parse_args()
    root = args.directory
    questions = evaluation.load(root / 'questions-v1.reviewed.json')['questions']
    corpus = evaluation.load(root / 'search-corpus.json')
    lexical = evaluation.load(root / 'lexical-top25.json')
    doc_indices = {d['boxId']: i for i, d in enumerate(corpus)}
    for model in evaluation.MODELS:
        report = evaluation.load(root / f'comparison-{model}-v1.json')
        archived_source = root / ('evaluate-embeddings-' + report['scriptSha256'] + '.py')
        assert evaluation.sha(archived_source) == report['scriptSha256']
        assert all(evaluation.sha(root / name) == digest for name, digest in report['sourceHashes'].items())
        assert report['model']['revision'] == evaluation.MODELS[model][1]
        vectors_path = root / f'vectors-{model}-v1.npz'
        assert evaluation.sha(vectors_path) == report['vectorSha256']
        vectors = np.load(vectors_path, allow_pickle=False)
        documents, queries = vectors['documents'], vectors['queries']
        dimension = report['model']['dimensions']
        assert documents.shape == (len(corpus), dimension)
        assert queries.shape == (len(questions), dimension)
        assert np.isfinite(documents).all() and np.isfinite(queries).all()
        assert np.allclose(np.linalg.norm(documents, axis=1), 1, atol=1e-5)
        assert np.allclose(np.linalg.norm(queries, axis=1), 1, atol=1e-5)
        for n, (question, sem, hyb, lex) in enumerate(zip(questions, report['results']['semantic'], report['results']['hybrid'], lexical['results'])):
            assert sem['id'] == hyb['id'] == lex['id'] == question['id']
            scores = documents @ queries[n]
            order = sorted(range(len(corpus)), key=lambda i: (-float(scores[i]), corpus[i]['boxId']))
            assert [m['boxId'] for m in sem['matches']] == [corpus[i]['boxId'] for i in order]
            fusion = {}
            for ranking in [order[:25], [doc_indices[m['boxId']] for m in lex['matches']]]:
                for rank, i in enumerate(ranking, 1):
                    fusion[i] = fusion.get(i, 0) + 1 / (60 + rank)
            fused_order = sorted(fusion, key=lambda i: (-fusion[i], corpus[i]['boxId']))
            assert [m['boxId'] for m in hyb['matches']] == [corpus[i]['boxId'] for i in fused_order]
            for row, indices in [(sem, order), (hyb, fused_order)]:
                assert np.isclose(row['similarity'], scores[indices[0]], atol=1e-6)
                assert np.isclose(row['margin'], scores[indices[0]] - scores[indices[1]], atol=1e-6)
                for match in row['matches']:
                    document = corpus[doc_indices[match['boxId']]]
                    assert match['locationId'] == document['locationId']
                    assert np.isclose(match['similarity'], scores[doc_indices[match['boxId']]], atol=1e-6)
            assert all(np.isclose(m['rrfScore'], fusion[doc_indices[m['boxId']]]) for m in hyb['matches'])
        for method in ['semantic', 'hybrid']:
            rows = report['results'][method]
            assert evaluation.ranking_metrics(rows, questions) == report['retrieval'][method]
            policy = report['policy'][method]
            predicted = []
            for question, row in zip(questions, rows):
                fold = next(f for f in policy['folds'] if f['heldOutGroup'] == question['groupId'])
                assert set(fold['trainIds']) == {q['id'] for q in questions if q['groupId'] != question['groupId']}
                assert set(fold['testIds']) == {q['id'] for q in questions if q['groupId'] == question['groupId']}
                prediction = evaluation.decide(row, fold['similarityThreshold'], fold['marginThreshold'])
                assert prediction == policy['predictions'][question['id']]
                predicted.append(prediction)
            assert evaluation.policy_metrics(rows, questions, predicted) == policy['metrics']
        assert evaluation.ranking_metrics(lexical['results'], questions) == report['retrieval']['lexical']
        print(f'{model}: hashes, normalized finite vectors, complete rankings, stored destinations, RRF, metrics and held-out groups PASS')
    print('Both private comparison reports passed. This does not test speech or production endpoints.')


if __name__ == '__main__':
    main()
