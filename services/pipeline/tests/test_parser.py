from pathlib import Path
from zipfile import ZipFile

import pytest
from bs4 import BeautifulSoup

from observatory.parser import (
    ParsedDocument,
    ParsedSection,
    parse_artifact,
    _select_primary_linked_artifact,
    extract_html_source_metadata,
    parse_html_artifact,
    parse_hwpx_artifact,
    parse_odt_artifact,
    parse_pdf_artifact,
)


def test_parse_html_artifact_sections(tmp_path: Path) -> None:
    artifact = tmp_path / "source.html"
    artifact.write_text(
        """
        <html lang="en">
          <head><title>Example Rule</title></head>
          <body>
            <h1>Overview</h1>
            <p>First paragraph.</p>
            <p>Second paragraph.</p>
            <h2>Requirements</h2>
            <ul><li>Red-teaming</li><li>Disclosure</li></ul>
          </body>
        </html>
        """,
        encoding="utf-8",
    )
    metadata = {
        "title": "Example Rule",
        "canonical_url": "https://example.com/rule",
        "artifact_path": str(artifact),
    }

    parsed = parse_html_artifact(artifact, metadata)

    assert parsed.title == "Example Rule"
    assert parsed.language == "en"
    assert len(parsed.sections) == 2
    assert parsed.sections[0].heading == "Overview"
    assert "Red-teaming" in parsed.plain_text


def test_parse_html_artifact_prefers_nested_content_root_over_header_chrome(tmp_path: Path) -> None:
    artifact = tmp_path / "source.html"
    artifact.write_text(
        """
        <html lang="zh">
          <head><title>Policy Page</title></head>
          <body>
            <header>
              <nav><a href="/">Home</a><a href="/search">Search</a></nav>
            </header>
            <div class="wrap">
              <table><tr><td>
                <div class="pages_content" id="UCAP-CONTENT">
                  <p><span style="font-weight: bold;">I. Strategic posture</span></p>
                  <p>Artificial intelligence is a strategic technology.</p>
                  <p><span style="font-weight: bold;">II. Objectives</span></p>
                  <p>Build national capabilities and governance mechanisms.</p>
                </div>
              </td></tr></table>
            </div>
          </body>
        </html>
        """,
        encoding="utf-8",
    )
    metadata = {
        "title": "Policy Page",
        "canonical_url": "https://example.com/policy",
        "artifact_path": str(artifact),
    }

    parsed = parse_html_artifact(artifact, metadata)

    assert parsed.language == "zh"
    assert "Home" not in parsed.plain_text
    assert "Artificial intelligence is a strategic technology." in parsed.plain_text
    assert len(parsed.sections) == 2
    assert parsed.sections[0].heading == "I. Strategic posture"
    assert parsed.sections[1].heading == "II. Objectives"


def test_parse_pdf_artifact_from_seed_file() -> None:
    root = Path(__file__).resolve().parents[3]
    artifact = root / "data" / "raw" / "japan" / "jp_social_principles_human_centric_ai" / "source.pdf"
    metadata = {
        "title": "Social Principles of Human-Centric AI",
    }

    parsed = parse_pdf_artifact(artifact, metadata)

    assert parsed.document_format == "pdf"
    assert parsed.sections
    assert "AI" in parsed.plain_text


def test_parse_pdf_artifact_uses_pdftotext_when_it_is_materially_better(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    artifact = tmp_path / "source.pdf"
    artifact.write_bytes(b"%PDF-1.4\n")
    metadata = {"title": "Thin PDF"}

    monkeypatch.setattr(
        "observatory.parser._extract_pdf_sections_with_pypdf",
        lambda path: ([ParsedSection(heading="Page 1", level=1, content="Title only")], ["empty_pdf_page:2"], None),
    )
    monkeypatch.setattr(
        "observatory.parser._extract_pdf_sections_with_pdftotext",
        lambda path: (
            [
                ParsedSection(heading="Page 1", level=1, content="A much longer body of text that contains substantive extraction."),
                ParsedSection(heading="Page 2", level=1, content="Additional extracted material from the second page."),
            ],
            [],
        ),
    )

    parsed = parse_pdf_artifact(artifact, metadata)

    assert "substantive extraction" in parsed.plain_text
    assert "used_pdftotext_fallback" in parsed.warnings
    assert "empty_pdf_page:2" not in parsed.warnings


def test_parse_html_artifact_prefers_rendered_legal_body_over_share_controls(tmp_path: Path) -> None:
    artifact = tmp_path / "law.html"
    artifact.write_text(
        """
        <html lang="ko">
          <head><title>법령 > 본문 > 테스트 법률</title></head>
          <body id="bodyId">
            <div id="bodyContentTOP">
              <div id="viewwrapCenter">
                <div id="bodyContent">
                  <div id="contentBody" class="scr_ctrl">
                    <div class="cont_area">
                      <ul class="cont_icon">
                        <li><a>카카오톡</a></li>
                        <li><a>트위터</a></li>
                      </ul>
                      <div id="conTop" class="cont_top">
                        <h2>테스트 법률</h2>
                      </div>
                      <div id="conScroll" class="scr_area">
                        <div class="pgroup">
                          <p class="gtit">제1장 총칙</p>
                        </div>
                        <div class="pgroup">
                          <div class="lawcon">
                            <p class="pty1_p4">
                              <span class="bl">제1조(목적)</span>
                              이 법은 인공지능의 안전성과 신뢰를 확보하기 위한 기본 사항을 규정한다.
                            </p>
                          </div>
                        </div>
                        <div class="pgroup">
                          <div class="lawcon">
                            <p class="pty1_p4">
                              <span class="bl">제2조(정의)</span>
                              이 법에서 사용하는 용어의 뜻은 다음과 같다.
                            </p>
                            <p class="pty1_de2h">1. "인공지능"이란 학습과 추론을 수행하는 시스템을 말한다.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </body>
        </html>
        """,
        encoding="utf-8",
    )
    metadata = {
        "title": "테스트 법률",
        "canonical_url": "https://example.com/law",
        "artifact_path": str(artifact),
    }

    parsed = parse_html_artifact(artifact, metadata)

    assert "카카오톡" not in parsed.plain_text
    assert "제1조(목적)" in parsed.plain_text
    assert "인공지능의 안전성과 신뢰를 확보" in parsed.plain_text
    assert "제2조(정의)" in parsed.plain_text


def test_parse_html_artifact_prefers_board_view_area_for_policy_pages(tmp_path: Path) -> None:
    artifact = tmp_path / "board.html"
    artifact.write_text(
        """
        <html lang="ko">
          <head><title>정책 페이지</title></head>
          <body>
            <header>
              <nav>
                <a href="/">Home</a>
                <a href="/news">News</a>
              </nav>
            </header>
            <div class="boardViewArea">
              <table class="tbView">
                <tbody>
                  <tr><th>제목</th><td>개인정보위, 공공기관 인공지능 활용 시 개인정보 보호 강화</td></tr>
                  <tr><th>작성일</th><td>2025-09-22</td></tr>
                  <tr><td colspan="2" class="tbl_cnts">
                    <div>
                      <p>공공기관의 인공지능 활용 과정에서 개인정보 보호를 강화한다.</p>
                      <p>개인정보 영향평가 항목에 AI 특화 점검 사항을 반영한다.</p>
                    </div>
                  </td></tr>
                </tbody>
              </table>
            </div>
          </body>
        </html>
        """,
        encoding="utf-8",
    )
    metadata = {
        "title": "정책 페이지",
        "canonical_url": "https://example.com/board",
        "artifact_path": str(artifact),
    }

    parsed = parse_html_artifact(artifact, metadata)

    assert "Home" not in parsed.plain_text
    assert "개인정보위, 공공기관 인공지능 활용 시 개인정보 보호 강화" in parsed.plain_text
    assert "개인정보 영향평가 항목에 AI 특화 점검 사항을 반영한다." in parsed.plain_text


def test_parse_html_artifact_flags_image_only_board_page(tmp_path: Path) -> None:
    artifact = tmp_path / "cardnews.html"
    artifact.write_text(
        """
        <html lang="ko">
          <head><title>카드뉴스 - 과학기술정보통신부</title></head>
          <body>
            <header>
              <nav><a href="/">Home</a><a href="/news">News</a></nav>
            </header>
            <div class="board_view">
              <div class="view_head">
                <h2>세계가 인정한 AI 3대 강국 대한민국</h2>
                <div class="meta">
                  <dl class="tit_con">
                    <dt class="tit">작성일</dt>
                    <dd class="con">Apr 14, 2026</dd>
                  </dl>
                </div>
              </div>
              <div class="view_cont">
                <p><img src="/one.png" alt="세계가 인정한 AI 3대 강국 대한민국3"></p>
                <p><img src="/two.png" alt="세계가 인정한 AI 3대 강국 대한민국3"></p>
                <p><img src="/three.png" alt="세계가 인정한 AI 3대 강국 대한민국3"></p>
              </div>
              <div class="open_mark">공공누리</div>
              <div class="view_nav">
                <ul class="prev_next">
                  <li><a href="#"><span class="lb">이전글</span><span class="txt">이전 기사</span></a></li>
                </ul>
              </div>
            </div>
          </body>
        </html>
        """,
        encoding="utf-8",
    )
    metadata = {
        "title": "세계가 인정한 AI 3대 강국 대한민국",
        "canonical_url": "https://example.com/cardnews",
        "artifact_path": str(artifact),
    }

    parsed = parse_html_artifact(artifact, metadata)

    assert parsed.plain_text == ""
    assert parsed.sections == []
    assert "image_only_html_content" in parsed.warnings


def test_parse_artifact_sniffs_hwpx_from_imported_bin(tmp_path: Path) -> None:
    artifact = tmp_path / "source.bin"
    _write_hwpx_fixture(artifact)

    parsed = parse_artifact(
        artifact,
        {
            "title": "테스트 HWPX",
            "document_format": "mixed",
            "content_type": "application/octet-stream",
        },
    )

    assert parsed.document_format == "hwpx"
    assert parsed.sections


def test_extract_html_source_metadata_prefers_publication_over_last_update(tmp_path: Path) -> None:
    artifact = tmp_path / "source.html"
    artifact.write_text(
        """
        <html lang="en">
          <head>
            <title>Commission notice</title>
          </head>
          <body>
            <div class="ecl-page-header">
              <ul class="ecl-page-header__meta">
                <li class="ecl-page-header__meta-item">POLICY AND LEGISLATION</li>
                <li class="ecl-page-header__meta-item">Publication 24 July 2025</li>
              </ul>
            </div>
            <main>
              <h4>Last update</h4>
              <p>26 March 2026</p>
            </main>
          </body>
        </html>
        """,
        encoding="utf-8",
    )

    extracted = extract_html_source_metadata(artifact)

    assert extracted["source_publication_date"] == "2025-07-24"
    assert extracted["source_publication_date_text"] == "Publication 24 July 2025"
    assert extracted["source_last_updated_date"] == "2026-03-26"


def test_parse_html_artifact_prefers_primary_linked_pdf_for_thin_download_wrapper(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    artifact = tmp_path / "source.html"
    artifact.write_text(
        """
        <html lang="en">
          <head><title>Wrapper page</title></head>
          <body>
            <h1>Explanatory Notice and Template for the Public Summary of Training Content</h1>
            <p>Below, you can download the file.</p>
            <section>
              <h2>Downloads</h2>
              <div class="file-card">
                <div class="title">
                  Explanatory Notice and Template for the Public Summary of Training Content - English (PDF)
                </div>
                <a href="/download/118480">Download</a>
              </div>
              <div class="file-card">
                <div class="title">Template - English (DOC)</div>
                <a href="/download/118578">Download</a>
              </div>
            </section>
          </body>
        </html>
        """,
        encoding="utf-8",
    )
    metadata = {
        "title": "Explanatory Notice and Template for the Public Summary of Training Content",
        "canonical_url": "https://example.com/library/training-content",
        "artifact_path": str(artifact),
        "language": "en",
    }

    cached_pdf = tmp_path / "linked_source.pdf"
    cached_pdf.write_bytes(b"%PDF-1.7 fake fixture")
    metadata["linked_artifact_url"] = "https://example.com/download/118480"

    monkeypatch.setattr(
        "observatory.parser.parse_pdf_artifact",
        lambda path, metadata: ParsedDocument(
            parser_version="0.2.0",
            title=metadata["title"],
            language="en",
            document_format="pdf",
            plain_text="Full PDF text",
            sections=[ParsedSection(heading="Page 1", level=1, content="Full PDF text")],
            warnings=[],
            source_artifact_path=str(path),
        ),
    )

    parsed = parse_html_artifact(artifact, metadata)

    assert parsed.document_format == "pdf"
    assert parsed.plain_text == "Full PDF text"
    assert "used_cached_linked_artifact" in parsed.warnings
    assert metadata["linked_artifact_url"] == "https://example.com/download/118480"


def test_parse_html_artifact_accepts_europa_cross_host_download_for_official_pdf(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    artifact = tmp_path / "source.html"
    artifact.write_text(
        """
        <html lang="en">
          <head><title>Wrapper page</title></head>
          <body>
            <h1>The Commission publishes guidelines on AI system definition to facilitate the first AI Act's rules application</h1>
            <section>
              <h2>Downloads</h2>
              <div class="file-card">
                <div class="title">Guidelines on the definition of an artificial intelligence system established by Regulation (EU) 20241689 (AI Act) (English)</div>
                <a download href="https://ec.europa.eu/newsroom/dae/redirection/document/112455">Download</a>
              </div>
            </section>
          </body>
        </html>
        """,
        encoding="utf-8",
    )
    metadata = {
        "title": "The Commission publishes guidelines on AI system definition to facilitate the first AI Act's rules application",
        "canonical_url": "https://digital-strategy.ec.europa.eu/en/library/commission-publishes-guidelines-ai-system-definition-facilitate-first-ai-acts-rules-application",
        "resolved_url": "https://digital-strategy.ec.europa.eu/en/library/commission-publishes-guidelines-ai-system-definition-facilitate-first-ai-acts-rules-application",
        "artifact_path": str(artifact),
        "language": "en",
    }

    cached_pdf = tmp_path / "linked_source.pdf"
    cached_pdf.write_bytes(b"%PDF-1.7 fake fixture")
    metadata["linked_artifact_url"] = "https://ec.europa.eu/newsroom/dae/redirection/document/112455"

    monkeypatch.setattr(
        "observatory.parser.parse_pdf_artifact",
        lambda path, metadata: ParsedDocument(
            parser_version="0.2.0",
            title=metadata["title"],
            language="en",
            document_format="pdf",
            plain_text="Commission guideline PDF",
            sections=[ParsedSection(heading="Page 1", level=1, content="Commission guideline PDF")],
            warnings=[],
            source_artifact_path=str(path),
        ),
    )

    parsed = parse_html_artifact(artifact, metadata)

    assert parsed.document_format == "pdf"
    assert parsed.plain_text == "Commission guideline PDF"
    assert "used_cached_linked_artifact" in parsed.warnings
    assert metadata["linked_artifact_url"] == "https://ec.europa.eu/newsroom/dae/redirection/document/112455"


def test_parse_html_artifact_download_wrapper_with_long_intro_still_prefers_primary_pdf(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    artifact = tmp_path / "source.html"
    artifact.write_text(
        """
        <html lang="en">
          <head><title>Wrapper page</title></head>
          <body>
            <h1>Wrapper page</h1>
            <div>
              <p>This page introduces the guidance and provides explanatory context.</p>
              <p>The guidance helps providers understand the legal concept and practical application under the AI Act.</p>
              <p>The Commission notes that the guidance is non-binding and may be updated in light of practical experience.</p>
              <p>The AI Act promotes innovation while protecting health, safety, and fundamental rights.</p>
              <p>The guidance is published alongside additional implementation materials and translations.</p>
            </div>
            <section>
              <h2>Downloads</h2>
              <div class="file-card">
                <div class="title">Guidelines on the definition of an artificial intelligence system established by Regulation (EU) 20241689 (AI Act) (English)</div>
                <a download href="https://ec.europa.eu/newsroom/dae/redirection/document/112455">Download</a>
              </div>
              <div class="file-card">
                <div class="title">Guidelines on the definition of an artificial intelligence system established by Regulation (EU) 20241689 (AI Act) (French)</div>
                <a download href="https://ec.europa.eu/newsroom/dae/redirection/document/118623">Download</a>
              </div>
            </section>
          </body>
        </html>
        """,
        encoding="utf-8",
    )
    metadata = {
        "title": "The Commission publishes guidelines on AI system definition to facilitate the first AI Act's rules application",
        "canonical_url": "https://digital-strategy.ec.europa.eu/en/library/commission-publishes-guidelines-ai-system-definition-facilitate-first-ai-acts-rules-application",
        "resolved_url": "https://digital-strategy.ec.europa.eu/en/library/commission-publishes-guidelines-ai-system-definition-facilitate-first-ai-acts-rules-application",
        "artifact_path": str(artifact),
        "language": "en",
    }

    cached_pdf = tmp_path / "linked_source.pdf"
    cached_pdf.write_bytes(b"%PDF-1.7 fake fixture")
    metadata["linked_artifact_url"] = "https://ec.europa.eu/newsroom/dae/redirection/document/112455"

    monkeypatch.setattr(
        "observatory.parser.parse_pdf_artifact",
        lambda path, metadata: ParsedDocument(
            parser_version="0.2.0",
            title=metadata["title"],
            language="en",
            document_format="pdf",
            plain_text="Commission guideline PDF",
            sections=[ParsedSection(heading="Page 1", level=1, content="Commission guideline PDF")],
            warnings=[],
            source_artifact_path=str(path),
        ),
    )

    parsed = parse_html_artifact(artifact, metadata)

    assert parsed.document_format == "pdf"
    assert "used_cached_linked_artifact" in parsed.warnings
    assert metadata["linked_artifact_url"] == "https://ec.europa.eu/newsroom/dae/redirection/document/112455"


def test_select_primary_linked_artifact_extracts_pipc_onclick_attachment() -> None:
    soup = BeautifulSoup(
        """
        <html>
          <body>
            <div class="boardViewArea">
              <table class="tbView">
                <tbody>
                  <tr><th>제목</th><td>공공분야 초거대 AI 도입·활용 가이드라인</td></tr>
                  <tr>
                    <td colspan="2">
                      <a href="#LINK" onclick="javascript:fn_egov_downFile('FILE_000000000558005','0','pdf')">다운로드</a>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </body>
        </html>
        """,
        "html.parser",
    )

    selected = _select_primary_linked_artifact(
        soup,
        base_url="https://www.pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS217&nttId=11024",
        metadata={
            "title": "공공분야 초거대 AI 도입·활용 가이드라인",
            "language": "ko",
        },
    )

    assert selected == (
        "https://www.pipc.go.kr/np/cmm/fms/FileDown.do?atchFileId=FILE_000000000558005&fileSn=0&fileExtsn=pdf&cnvCnt=",
        "제목 공공분야 초거대 AI 도입·활용 가이드라인 다운로드",
        "pdf",
    )


def test_select_primary_linked_artifact_skips_unrelated_ai_pact_pledges_pdf() -> None:
    soup = BeautifulSoup(
        """
        <html>
          <body>
            <h1>AI Pact</h1>
            <section>
              <p>The AI Pact encourages organisations to prepare for the AI Act.</p>
              <a download href="https://ec.europa.eu/newsroom/dae/redirection/document/107430">
                voluntary pledges (.PDF)
              </a>
            </section>
          </body>
        </html>
        """,
        "html.parser",
    )

    selected = _select_primary_linked_artifact(
        soup,
        base_url="https://digital-strategy.ec.europa.eu/en/policies/ai-pact",
        metadata={
            "title": "AI Pact",
            "language": "en",
        },
    )

    assert selected is None


def test_select_primary_linked_artifact_skips_unrelated_nist_plan_attachment() -> None:
    soup = BeautifulSoup(
        """
        <html>
          <body>
            <h1>AI Standards | NIST</h1>
            <section>
              <p>NIST coordinates AI standards work across the federal government.</p>
              <a href="https://www.nist.gov/document/report-plan-federal-engagement-developing-technical-standards-and-related-tools">
                Plan for Federal Engagement in AI Standards and Related Tools
              </a>
            </section>
          </body>
        </html>
        """,
        "html.parser",
    )

    selected = _select_primary_linked_artifact(
        soup,
        base_url="https://www.nist.gov/artificial-intelligence/ai-standards",
        metadata={
            "title": "AI Standards | NIST",
            "language": "en",
        },
    )

    assert selected is None


def test_select_primary_linked_artifact_skips_nist_rmf_development_draft_attachment() -> None:
    soup = BeautifulSoup(
        """
        <html>
          <body>
            <h1>AI RMF Development | NIST</h1>
            <section>
              <a href="https://www.nist.gov/document/ai-risk-management-framework-2nd-draft">
                second draft of the AI RMF
              </a>
            </section>
          </body>
        </html>
        """,
        "html.parser",
    )

    selected = _select_primary_linked_artifact(
        soup,
        base_url="https://www.nist.gov/itl/ai-risk-management-framework/ai-rmf-development",
        metadata={
            "title": "AI RMF Development | NIST",
            "language": "en",
        },
    )

    assert selected is None


def _write_hwpx_fixture(path: Path) -> None:
    with ZipFile(path, "w") as archive:
        archive.writestr("mimetype", "application/hwp+zip")
        archive.writestr(
            "Contents/content.hpf",
            """<?xml version="1.0" encoding="UTF-8"?>
            <opf:package xmlns:opf="http://www.idpf.org/2007/opf">
              <opf:metadata>
                <opf:title>인공지능 발전과 신뢰 기반 조성 등에 관한 기본법 시행령안</opf:title>
                <opf:language>ko</opf:language>
                <opf:meta name="subject" content="text">인공지능 발전과 신뢰 기반 조성 등에 관한 기본법 시행령안</opf:meta>
              </opf:metadata>
            </opf:package>
            """,
        )
        archive.writestr(
            "Contents/section0.xml",
            """<?xml version="1.0" encoding="UTF-8"?>
            <hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
              <hp:p><hp:run><hp:t>제1조(목적)</hp:t></hp:run></hp:p>
              <hp:p><hp:run><hp:t>이 영은 인공지능 기본법의 시행에 필요한 사항을 규정한다.</hp:t></hp:run></hp:p>
              <hp:p><hp:run><hp:t>제2조(적용범위)</hp:t></hp:run></hp:p>
              <hp:p><hp:run><hp:t>고영향 인공지능과 관련된 의무를 정한다.</hp:t></hp:run></hp:p>
            </hs:sec>
            """,
        )
        archive.writestr("Preview/PrvText.txt", "미리보기 텍스트")


def _write_odt_fixture(path: Path) -> None:
    with ZipFile(path, "w") as archive:
        archive.writestr("mimetype", "application/vnd.oasis.opendocument.text")
        archive.writestr(
            "content.xml",
            """<?xml version="1.0" encoding="UTF-8"?>
            <office:document-content
              xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
              xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
              <office:body>
                <office:text>
                  <text:p>Article 1 Purpose</text:p>
                  <text:p>This guidance describes public-sector AI privacy impact assessment items.</text:p>
                </office:text>
              </office:body>
            </office:document-content>
            """,
        )


def test_parse_hwpx_artifact_extracts_text_from_sections(tmp_path: Path) -> None:
    artifact = tmp_path / "source.hwpx"
    _write_hwpx_fixture(artifact)

    parsed = parse_hwpx_artifact(
        artifact,
        {
            "title": "시행령안",
            "language": "ko",
        },
    )

    assert parsed.document_format == "hwpx"
    assert parsed.language == "ko"
    assert parsed.title == "인공지능 발전과 신뢰 기반 조성 등에 관한 기본법 시행령안"
    assert "제1조(목적)" in parsed.plain_text
    assert "고영향 인공지능과 관련된 의무를 정한다." in parsed.plain_text


def test_parse_odt_artifact_extracts_text_from_content_xml(tmp_path: Path) -> None:
    artifact = tmp_path / "source.odt"
    _write_odt_fixture(artifact)

    parsed = parse_odt_artifact(
        artifact,
        {
            "title": "PIA AI items",
            "language": "en",
        },
    )

    assert parsed.document_format == "odt"
    assert parsed.language == "en"
    assert "Article 1 Purpose" in parsed.plain_text
    assert "public-sector AI privacy impact assessment items" in parsed.plain_text


def test_parse_html_artifact_prefers_linked_hwpx_for_legislative_notice(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    artifact = tmp_path / "source.html"
    artifact.write_text(
        """
        <html lang="ko">
          <head><title>입법행정예고 - 과학기술정보통신부</title></head>
          <body>
            <div class="boardViewArea">
              <p>「인공지능 발전과 신뢰기반조성 등에 관한 기본법 시행령」을 제정함에 있어 의견을 듣고자 한다.</p>
              <div class="attachments">
                <a href="javascript:void(0);" onclick="fn_download('51534', '1', 'hwpx');">다운로드</a>
                <span>과학기술정보통신부 공고 제2025-1000호(인공지능 발전과 신뢰 기반 조성등에 관한 기본법 시행령 제정안 입법예고).hwpx</span>
              </div>
              <div class="attachments">
                <a href="javascript:void(0);" onclick="fn_download('51534', '4', 'hwpx');">다운로드</a>
                <span>「인공지능 발전과 신뢰 기반 조성 등에 관한 기본법」 시행령(안).hwpx</span>
              </div>
            </div>
          </body>
        </html>
        """,
        encoding="utf-8",
    )
    linked_hwpx = tmp_path / "linked_source.hwpx"
    _write_hwpx_fixture(linked_hwpx)
    metadata = {
        "title": "인공지능 기본법 시행령 제정안 입법예고",
        "canonical_url": "https://www.msit.go.kr/bbs/view.do?bbsSeqNo=84&mId=109&mPid=103&nttSeqNo=3186315&sCode=user",
        "resolved_url": "https://www.msit.go.kr/bbs/view.do?bbsSeqNo=84&mId=109&mPid=103&nttSeqNo=3186315&sCode=user",
        "artifact_path": str(artifact),
        "linked_artifact_url": "https://www.msit.go.kr/ssm/file/fileDown.do?atchFileNo=51534&fileOrd=4",
        "language": "ko",
    }

    parsed = parse_html_artifact(artifact, metadata)

    assert parsed.document_format == "hwpx"
    assert metadata["linked_artifact_url"] == "https://www.msit.go.kr/ssm/file/fileDown.do?atchFileNo=51534&fileOrd=4"
    assert "used_cached_linked_artifact" in parsed.warnings


def test_parse_html_artifact_prefers_linked_odt_for_download_wrapper(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    artifact = tmp_path / "source.html"
    artifact.write_text(
        """
        <html lang="en">
          <head><title>Wrapper page</title></head>
          <body>
            <h1>Public-sector AI privacy impact assessment items</h1>
            <section>
              <h2>Downloads</h2>
              <div class="file-card">
                <div class="title">Public-sector AI privacy impact assessment items (ODT)</div>
                <a download href="https://example.com/document/ai-pia-items.odt">Download</a>
              </div>
            </section>
          </body>
        </html>
        """,
        encoding="utf-8",
    )
    linked_odt = tmp_path / "linked_source.odt"
    _write_odt_fixture(linked_odt)
    metadata = {
        "title": "Public-sector AI privacy impact assessment items",
        "canonical_url": "https://example.com/library/ai-pia-items",
        "resolved_url": "https://example.com/library/ai-pia-items",
        "artifact_path": str(artifact),
        "linked_artifact_url": "https://example.com/document/ai-pia-items.odt",
        "language": "en",
    }

    parsed = parse_html_artifact(artifact, metadata)

    assert parsed.document_format == "odt"
    assert metadata["linked_artifact_url"] == "https://example.com/document/ai-pia-items.odt"
    assert "used_cached_linked_artifact" in parsed.warnings
