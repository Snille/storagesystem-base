"""Run the real HA client's API and result mapping against an isolated server.

This loads api.py directly and does not start or configure Home Assistant.
Requires aiohttp. Never point this at a production instance.
"""

import argparse
import asyncio
import importlib.util
import os
import sys
from pathlib import Path

import aiohttp

sys.dont_write_bytecode = True


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


async def verify(args):
    component = Path(args.source) / "custom_components" / "storagesystem"
    api = load("storage_reference_api", component / "api.py")
    result = load("storage_reference_result", component / "result.py")
    key = os.environ.get("STORAGE_API_KEY", "")
    async with aiohttp.ClientSession() as session:
        client = api.StorageSystemClient(session, args.base_url, key)
        health = await client.async_health()
        assert health["ok"] and health["service"] == "lagersystem"
        search = await client.async_search(args.query, 5)
        assert search["count"] > 0, "The isolated fixture must contain a matching box."
        match = search["matches"][0]
        box = await client.async_box(match["boxId"])
        assert box["boxId"] == match["boxId"]
        ask = await client.async_ask(args.query)
        assert ask["answer"] and ask["source"] == args.expected_source
        mapped = result.build_result(ask, mode="ask", query=args.query)
        assert mapped["box_id"] == match["boxId"] and mapped["match_count"] > 0
        assert mapped["location"] and mapped["keywords"]
        if key:
            try:
                await api.StorageSystemClient(session, args.base_url, "incorrect-fixture-key").async_health()
            except api.StorageSystemAuthError:
                pass
            else:
                raise AssertionError("The client must classify rejected keys as authentication errors.")
    print("PASS: real HA client health/search/ask/box, result mapping, and authentication.")
    print("Scope: active HTTP client verification; HA entities, card and config flow are not exercised.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, help="Read-only reference storagesystem-ha checkout")
    parser.add_argument("--base-url", required=True, help="Isolated development server URL")
    parser.add_argument("--query", default="demo")
    parser.add_argument("--expected-source", choices=["search", "ai", "semantic"], default="search")
    asyncio.run(verify(parser.parse_args()))
