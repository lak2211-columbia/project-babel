from observatory.source_registry import load_all_source_manifests


def test_source_manifests_load() -> None:
    manifests = load_all_source_manifests()
    assert manifests
    assert {manifest.jurisdiction for manifest in manifests} == {
        "china",
        "european_union",
        "japan",
        "south_korea",
        "united_states",
    }
