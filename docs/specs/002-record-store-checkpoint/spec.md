---
title: Bootstrap immutable record-store checkpoint
description: Accepted immutable canonical record-store source and its bounded acceptance chain.
status: completed
type: spec
owner: operator
created: 2026-10-06
tags:
  - spec
  - lcim
  - bootstrap
  - record-store
---
# Bootstrap immutable record-store checkpoint

## Outcome

The Phase B immutable canonical record-store source checkpoint is complete and cleared for integration. The accepted source is `src/source-checkpoint/record-store.mjs`, 44,805 bytes with SHA-256 `1ee6ee1c17a3eee305411a7368ba68684f7f6603c65552848d58280b3d9ed5fb`. The private evidence identities and zero-effect rejected attempts are recorded in the [evidence register](../../project/observations.md#2026-10-06-record-store-checkpoint-completion). The implementation-unit result is summarized in the [completion report](completion-report.md).

This checkpoint completes the record-storage item in the [original delivery checklist](../../project/delivery-plan.md). It does not complete the full Bootstrap verifier, final Bootstrap G1, C30 delivery, installation, activation, or the LCIM 3.0 MVP.

## Delivered behavior

The module exports:

- `RecordStoreError`, with stable public-safe error codes and non-enumerable retained causes;
- `recordPath(root, ref)`, which derives a confined content-addressed path without creating files;
- `persistCanonicalRecord({ root, value, limits })`, which canonicalizes, validates, writes, verifies, fsyncs, and publishes an immutable record through a same-filesystem hard link;
- `readCanonicalRecord({ root, ref, limits })`, which opens no-follow and revalidates type, mode, link count, identity, size, canonical bytes, and digest before returning a value.

Final records use `<root>/records/sha256/<first2>/<remaining62>.jcs`. Directories are mode 0700 and record files are mode 0600. Staging creation is anchored to a live verified directory descriptor through the supported Linux or Darwin stable alias. Publication does not overwrite an existing final path, and exact existing records are accepted only after full verification.

## Acceptance criteria

- [x] Consume the accepted parser and canonicalization predecessor without changing it.
- [x] Confine every derived path and reject unsafe directory, symlink, mode, link-count, identity, and platform states.
- [x] Create staging exclusively and no-follow through a verified live directory identity.
- [x] Write and verify exact canonical bytes before hard-link publication.
- [x] Preserve primary failures together with directory and child-close cleanup failures.
- [x] Preserve the post-anchor verification failure before the child-close failure in a non-enumerable `AggregateError`.
- [x] Fsync the file and directory chain before reporting success.
- [x] Read exact canonical bytes through a no-follow, identity-checked descriptor.
- [x] Pass isolated and target validation against all nine source-checkpoint test files.
- [x] Pass exact-source OAuth SOL XHIGH review with zero surviving findings.
- [x] Keep private evidence, credentials, and provider transcripts outside the public repository.

## Interfaces and migration

No stable interface under `src/shared/**` or `schemas/common/**` changed. The new module lives beside the accepted parser under `src/source-checkpoint/`. Later Bootstrap units may import its object-form APIs as the accepted storage predecessor. A future cross-sprint interface change still requires a recorded request before stable shared contracts are edited.

## Non-goals

Closed nested record schemas, reference-graph validation, complete verifier closure, registry generations and CAS, admission/currentness, proof export, final G1, C30 implementation, packaging, Pi installation, and runtime activation remain open in the [delivery plan](../../project/delivery-plan.md).
