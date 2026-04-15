from observatory.taxonomy import load_taxonomy


def test_taxonomy_loads() -> None:
    taxonomy = load_taxonomy()
    assert "risk_framings" in taxonomy
    assert "policy_requirements" in taxonomy

