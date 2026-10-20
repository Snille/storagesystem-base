"""Run the real HA core and unmodified integration in a disposable Docker config.

No discovery, real devices, TTS, production endpoints or credentials are used.
Invoked by verify-ha-container.ps1, not a mock of HA's modules or API client.
"""
import asyncio
import json
import os
import signal
from pathlib import Path

import aiohttp
import yaml
from homeassistant.core import HomeAssistant
from homeassistant.bootstrap import async_from_config_dict
from homeassistant.config_entries import ConfigEntryState
from homeassistant.const import __version__
from homeassistant import loader
from homeassistant.components.onboarding import STEPS, STORAGE_VERSION, STORAGE_KEY


async def main():
    # Disposable fixture bootstrap: bypass first-run onboarding, then create a
    # local test account through HA's real authentication provider below.
    Path('/config/.storage').mkdir(parents=True, exist_ok=True)
    Path('/config/.storage/onboarding').write_text(json.dumps({'version': STORAGE_VERSION, 'minor_version': 1, 'key': STORAGE_KEY, 'data': {'done': list(STEPS)}}))
    Path('/config/ui-lovelace.yaml').write_text(yaml.safe_dump({'title': 'Storage acceptance', 'views': [{'title': 'Storage', 'path': 'storage', 'cards': [{'type': 'custom:storagesystem-search-card', 'language': 'sv', 'title': 'Lagersök · isolerat test'}]}]}, allow_unicode=True))
    hass = HomeAssistant('/config')
    loader.async_setup(hass)
    try:
        config = {
            'homeassistant': {'name': 'Storage acceptance', 'latitude': 0, 'longitude': 0, 'elevation': 0, 'unit_system': 'metric', 'time_zone': 'Europe/Stockholm'},
            'http': {},
            'api': {}, 'frontend': {}, 'config': {}, 'conversation': {},
            'lovelace': {'mode': 'yaml'},
            'logger': {'default': 'warning'},
        }
        assert await async_from_config_dict(config, hass) is hass
        await hass.async_start()
        user = await hass.auth.async_create_user('Acceptance', group_ids=['system-admin'])
        provider = hass.auth.get_auth_provider('homeassistant', None)
        await provider.async_add_auth('acceptance', 'isolated-fixture-only')
        credentials = await provider.async_get_or_create_credentials({'username': 'acceptance'})
        await hass.auth.async_link_user(user, credentials)
        refresh = await hass.auth.async_create_refresh_token(user, client_id='http://localhost:3215/')
        token = hass.auth.async_create_access_token(refresh)
        print(f'HA {__version__}: real core and HTTP/frontend started; discovery disabled.', flush=True)
        flow = await hass.config_entries.flow.async_init('storagesystem', context={'source': 'user'})
        assert flow['type'] == 'form', flow['type']
        invalid = await hass.config_entries.flow.async_configure(flow['flow_id'], {'base_url': 'http://storage-fixture:3212', 'api_key': 'wrong-key'})
        assert invalid['errors'].get('api_key') == 'invalid_auth'
        configured = await hass.config_entries.flow.async_configure(flow['flow_id'], {'base_url': 'http://storage-fixture:3212/api/public', 'api_key': 'ui-fixture-read'})
        assert configured['type'] == 'create_entry', configured['type']
        entry = configured['result']
        await hass.async_block_till_done()
        assert entry.state is ConfigEntryState.LOADED, entry.state
        print('PASS: actual user config flow rejects wrong keys, normalizes URL and loads the integration.', flush=True)
        async with aiohttp.ClientSession(headers={'Authorization': f'Bearer {token}'}) as client:
            async def request(path, data=None):
                async with client.request('POST' if data is not None else 'GET', 'http://127.0.0.1:8123/api/' + path, json=data) as response:
                    assert response.status == 200, (path, response.status)
                    return await response.json()
            states = await request('states')
            online = [state for state in states if state['entity_id'].startswith('binary_sensor.') and state['state'] == 'on']
            assert online, 'Expected a real online binary sensor.'
            events = []
            unsubscribe = hass.bus.async_listen('storagesystem_result', lambda event: events.append(event.data))
            search = await request('services/storagesystem/search?return_response', {'query': 'Var finns träskruvarna?', 'limit': 5})
            result = search['service_response']
            assert result['box_id'] == 'FIXTURE-SCREWS', result.get('box_id')
            assert events, 'Expected result event.'
            ask = await request('services/storagesystem/ask?return_response', {'query': 'Var finns träskruvarna?', 'speak': False})
            assert ask['service_response']['box_id'] == 'FIXTURE-SCREWS'
            states = await request('states')
            assert any(state['state'] == 'FIXTURE-SCREWS' for state in states if state['entity_id'].startswith('sensor.'))
            conversation = next(state['entity_id'] for state in states if state['entity_id'].startswith('conversation.') and 'storage' in state['entity_id'])
            spoken = await request('conversation/process', {'text': 'Var finns träskruvarna?', 'agent_id': conversation, 'language': 'sv'})
            assert 'Träskruvar' in spoken['response']['speech']['plain']['speech']
            assert spoken['response']['response_type'] != 'error'
            async with client.get('http://127.0.0.1:8123/storagesystem_frontend/storagesystem-search-card.js') as response:
                assert response.status == 200
                assert 'customElements.define' in await response.text()
            thumbnail = result.get('thumbnail_url')
            assert thumbnail, 'The real result mapper must expose the thumbnail.'
            # APP_BASE_URL targets the host browser. Inside this Docker network
            # use the same server's alias; the signed asset path is unchanged.
            assert thumbnail.startswith('http://localhost:3216/api/public/assets/')
            async with client.get(thumbnail.replace('http://localhost:3216', 'http://storage-fixture:3212', 1)) as response:
                assert response.status == 200
                assert response.headers['Content-Type'].startswith('image/')
                assert await response.read()
            unsubscribe()
            print('PASS: HTTP search/ask services, real entities, result event, conversation response, bundled card delivery and signed photo retrieval.', flush=True)
        # The reference integration deliberately debounces persistence by 5s.
        # Wait for its normal write before checking restoration on reload.
        await asyncio.sleep(6)
        await hass.config_entries.async_reload(entry.entry_id)
        await hass.async_block_till_done()
        assert entry.state is ConfigEntryState.LOADED
        assert entry.runtime_data.last_result['box_id'] == 'FIXTURE-SCREWS'
        print('PASS: integration reload retains the latest result. No real devices or TTS contacted.', flush=True)
        Path('/config/acceptance-passed').write_text(__version__)
        if os.environ.get('HA_ACCEPTANCE_HOLD') == '1':
            print('Isolated runtime held on http://localhost:3215; fixture login acceptance / isolated-fixture-only.', flush=True)
            stopped = asyncio.Event()
            asyncio.get_running_loop().add_signal_handler(signal.SIGTERM, stopped.set)
            asyncio.get_running_loop().add_signal_handler(signal.SIGINT, stopped.set)
            await stopped.wait()
    finally:
        await hass.async_stop()


asyncio.run(main())
