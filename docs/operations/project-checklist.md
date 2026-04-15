# Project Checklist

## Phase 0: Foundations

- [x] Create repository scaffold
- [x] Define initial taxonomy
- [x] Write product brief, architecture, and roadmap
- [x] Add prompt stubs for extraction and framing
- [x] Add minimal pipeline package and validation
- [ ] Define taxonomy versioning rules
- [x] Define source manifest schema
- [x] Define document storage conventions

## Phase 1: Data acquisition

- [x] Create jurisdiction registry with issuing bodies and official source lists
- [x] Create source manifest format for official documents
- [x] Implement source manifest validation
- [x] Add fetcher for HTML sources
- [x] Add fetcher for PDF sources
- [x] Add raw artifact storage layout
- [x] Add retrieval logging and retry handling
- [x] Add checksum or content-hash tracking
- [x] Add browser-backed retrieval fallback for JS-heavy official sources
- [x] Add portal discovery candidate scans with cacheable outputs
- [x] Add an orchestrated source refresh workflow
- [x] Add family-based source expansion planning with candidate roles, substantive scoring, and portal coverage buckets

## Phase 2: Parsing and normalization

- [x] Implement normalized text model
- [x] Parse HTML into structured sections
- [x] Parse PDFs with OCR fallback hooks
- [x] Preserve headings, lists, and section metadata
- [x] Track parser warnings and confidence
- [x] Add parser regression fixtures

## Phase 3: Structured extraction

- [x] Define extraction response schema
- [x] Implement extraction prompt runner
- [x] Save evidence spans with each label
- [x] Map outputs strictly to taxonomy labels
- [x] Add confidence scoring and validation
- [x] Expand extraction schema with covered actors, prohibited practices, enforcement authorities, compliance deadlines, and penalties summary
- [ ] Add extraction fixtures and golden tests

## Phase 4: Risk framing analysis

- [x] Define framing response schema
- [x] Implement framing prompt runner
- [x] Save dominant and secondary frames
- [x] Save evidence spans and rationale summary
- [ ] Add framing fixtures and golden tests
- [ ] Add framing-consistency diagnostics across reruns

## Phase 5: Persistence and automation

- [x] Design Postgres schema
- [x] Add first SQL migrations
- [x] Persist machine outputs in Postgres
- [x] Add artifact replay command to sync saved analyses into Postgres
- [x] Remove the manual review queue and approval path
- [x] Add candidate enrichment and manifest promotion workflow for expanding the official-source corpus
- [ ] Add automated quality-monitoring snapshots

## Phase 6: Analytics

- [ ] Compute policy divergence metrics
- [ ] Compute framing divergence metrics
- [ ] Define composite divergence calculation
- [ ] Precompute overview aggregates
- [ ] Add export-ready tables for research output

## Phase 7: Web product

- [x] Set up Next.js app
- [x] Build overview dashboard
- [ ] Build jurisdiction comparison page
- [x] Build document explorer
- [x] Build document detail page
- [x] Connect UI to seed data contracts
- [x] Replace seed data with real API responses

## Phase 8: Quality and publication

- [ ] Build a gold-labeled evaluation set
- [ ] Track extraction precision and recall
- [ ] Track framing agreement metrics
- [x] Add data coverage and freshness reporting
- [ ] Add publication export workflow

## Current build slice

- [x] Write full implementation spec
- [x] Stand up the web app
- [x] Build the first overview page with seeded observatory data
- [x] Start the dev server
- [x] Verify the page in a browser
- [x] Add Sonnet 4.6 structured analysis runner
- [x] Add initial Postgres persistence layer
- [x] Add DB-backed overview reads
- [x] Add document explorer and detail pages
- [x] Harden source retrieval with logs, retries, and hash tracking
