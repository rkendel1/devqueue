"""Read-only artifact evidence extraction; does not activate Cline or classify APIs as supported."""
import hashlib, json, pathlib, sys, zipfile
artifact = pathlib.Path(sys.argv[1])
with zipfile.ZipFile(artifact) as archive:
    manifest = json.loads(archive.read('extension/package.json'))
    entry = manifest['main'].removeprefix('./')
    runtime = archive.read('extension/' + entry).decode()
    print(json.dumps({
        'filename': artifact.name,
        'sha256': hashlib.sha256(artifact.read_bytes()).hexdigest(),
        'identifier': manifest['publisher'] + '.' + manifest['name'],
        'version': manifest['version'],
        'main': entry,
        'activationEvents': manifest.get('activationEvents', []),
        'commands': manifest.get('contributes', {}).get('commands', []),
        'dependencies': manifest.get('dependencies', {}),
        'entrypointSymbolCounts': {symbol: runtime.count(symbol) for symbol in [
            'StartRuntimeSession', 'SendRuntimeSession', 'AbortRuntimeSession',
            'cline rpc', 'startNewTask', 'sendMessage', 'pressPrimaryButton',
            'pressSecondaryButton', 'subscribeToState', 'abortTask']},
    }, indent=2))
