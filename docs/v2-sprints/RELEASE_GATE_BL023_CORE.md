# BL-023 core release-gate rehearsal — operator only

**Status:** `PLAN_AMENDED / REHEARSAL_FIXTURES_PENDING`; not an implementation
prompt and not a release approval.

**Implementation precondition:** C30-01 through C30-14 implementations have
current independent PASS and verified source-checkpoint generations; G1/G2/G3
have passed on the current guidance/source generation. C30-13 implementation
completion is not runtime activation, and C30-14 implementation did not require
a pre-existing production settlement. No cryptographic signer or Keychain is a
precondition. The eventual fixture uses no real provider request.

LCIM 3.0 never creates the grouped commit, pushes, mutates a remote, creates a
PR, automates CI, merges, creates a hotfix branch or claims production
verification.

## Combined V8 phase and source-review boundary

Master §§7–8 permit only conditionally authorized external development, not
G2-before-construction: Bootstrap candidate precedes G1; real adoption follows
G1 and separate authorization; ordered C30 development needs current G1/G3,
accepted procedure/tools, task authorization and exact predecessor. Full G2
requires actual transitive integration including relevant C30-14 closure;
C30-07 alone is insufficient. Runtime rehearsal/activation/use still requires
all applicable current G1/G2/G3 and separate operator authorization. This edit
grants none; U1–U5 remain unresolved.

Accepted EXTERNAL_DEVELOPMENT_REVIEW source coverage/zero-finding/response lineage
is eligible under master §7.3 and qualified closed-format consumer validation,
not runtime Sol/finding/accounting/capability events. Runtime COMMIT deliberately
expands under §§2.5B/2.5D/4.5: integer private version-3 physical-ledger path/
complete length/SHA binding, both existing chains, pinned ledger-file/full-chain
fsync, all-facts/expiry recheck, then first witness COMMIT byte and full durability.
Ledger effects are fsync-only, repeated on fresh-authority recovery; no bundle-
derived ledger durability, duplicate COMMIT or ABANDON of matching ledger.
G3-V7-P1-01 is amended pending independent review; historical counts/pins are not
V8 execution results. Git commit and external registry CAS remain distinct.
V9 G3-V8-P1-01 explicitly adds commitBranch COMPLETE_EXACT_EXISTING to private
version 3: fresh one-use authority fsyncs ledger then existing witness/full chains,
ZERO bytes/records, before bundle/suffix flushes. Logical COMMITTED is not
eligibility; session knowledge is lost on exit/change and separate truncation
requires re-completion. Master §§2.5B/2.5D control; no historical writer proof or
pre-established ledger durability gates issuance. Parent finding is not independently resolved.

## Implementation DAG

- C30-13 implements activation/bootstrap and its exact-tail recovery.
- C30-14 may depend on the verified C30-13 implementation SHA.
- C30-14 implements build, rehearsal and manual-delivery finalization.
- Completing the C30-13 implementation sprint does not mean production
  activation has already been performed.
- Implementing C30-14 does not require a pre-existing production activation
  settlement.

## Runtime sequence — SEQ-V8-P1-01

Master §6.2 is the single controlling generation-scoped sequence, incorporated
in full, including all ten steps, subject/first-use rules and seven resume points.
After change S → S', invalidate affected activation/capability/review/build/release/
gate reliance; use authorized external reviews without stale runtime capability.
Validation/applicable RECHECK/seed-free FINAL_REVIEW must be followed by qualified
prepare before staging, separately authorized operator exact-path commit,
clean-successor verify and separately authorized registry CAS acceptance. Then
establish exact accepted-generation gate applicability: renew full integrated G2
for changed source/executable/dependency/packaging closure, G1/G3 for changed
subjects; verified unchanged scope alone permits explicit carry. FINAL_REVIEW
is not G2; "seed removal" is no exemption. Qualify changed verifier before first
use. Only then separately authorize successor activation, durable settlement,
current-fact/fresh-TTY capability and final delivery. S'' repeats affected
invalidation. Resume exact commits/CAS without duplication; never relabel prior
build/rehearsal evidence. These are FUTURE requirements, not permission to act.

The manual-delivery manifest consumes the fresh current activation, never the
invalidated predecessor activation. Remote publication, push, PR, CI, merge and
production verification remain outside LCIM 3.0.

The fixture binds seed ID/digest, seed mutator intent, current source-generation
ID, expected invariant, expected Sol proposal/finding identity and proof that
the seed is absent from the real repository. A missing seeded finding, silent
waiver or invented replacement fails closed. Seed removal invalidates all
reliance on seeded evidence and requires master §6.2's complete checkpoint,
adoption, gate-applicability and fresh successor path; history remains unchanged.

## Local authority and delivery

Before initial runtime activation, the operator confirms the exact repository,
source commit/tree, plan/configuration, routes, finite ceilings and operation
through the controlling TTY. Only C30-13 issues the module-private in-memory
production capability after `lcim.local-activation-settlement@1` and matching
witness COMMIT are durable, the settlement/current facts are reverified and
displayed, and fresh TTY confirmation is obtained. Seeded evidence invalidates
that settlement. After every master §6.2 review/checkpoint/adoption/gate step,
while capability is absent and under separate authorization, C30-13 uses only
`SUCCESSOR_ACTIVATION_PUBLICATION_AUTHORITY` for the four-candidate successor.
§2.5D's exact same-session durable relation, current facts/qualifications and
fresh TTY precede capability/finalization. Capability is never persisted.

The final packet uses `lcim.manual-delivery-manifest@1` bound to that fresh
current activation. It is content-addressed and manually inspected, not a
digital signature or remote publication authority. Signed distribution
envelopes belong to LCIM 3.1.

## Barrier and operator order

BL-023 uses exactly:

1. each sibling independently reaches complete current-generation Sol PASS;
2. each sibling emits its current checkpoint generation;
3. each sibling enters `APPROVED_WAITING_AT_BARRIER`;
4. the controller forms a barrier from the exact current sibling generations
   and common base;
5. composition/apply occurs in the declared deterministic order;
6. deterministic combined validation runs;
7. complete barrier FINAL_REVIEW runs;
8. actionable findings trigger combined repair, successor subject, validation,
   exact RECHECK and a new complete FINAL_REVIEW;
9. zero open actionable findings is established;
10. state enters `AWAITING_OPERATOR_CHECKPOINT_COMMIT`;
11. operator creates the grouped commit manually;
12. read-only verification proves the exact parent/tree/manifest/commit;
13. state becomes `BARRIER_COMMITTED`;
14. only the exact verified grouped commit SHA unlocks downstream work.

`APPROVED_WAITING_AT_BARRIER` never occurs after barrier FINAL_REVIEW. RECHECK
never approves a barrier or release.

## Fixture-only Git negative probes

Isolation begins before fixture preparation. The disposable fixture has no
origin and no credentials. Execute exactly:

```text
/usr/bin/git push origin HEAD
/usr/bin/git push <hard-coded-local-fixture-url> HEAD:<fixture-ref>
```

Both must fail nonzero, preserve local and target-bare byte/ref/object
manifests, use no credentials and reach no network outside the controller-owned
fixture namespace. Record exact manifests, exit codes, safe stderr
classifications, network namespace result and owned cleanup. Uncertain cleanup
quarantines.

## Mandatory BL-028 golden regression

The release gate includes an existing release whose identity/effective-date
authority resolves `UNKNOWN` while the source row/record identity remains.
Expected results are no clipping, no silent dropping, an explicit unresolved-
authority diagnostic and audit evidence bound to that reason. Any silent row
disappearance fails the gate.

## Isolation and report policy

HOME/XDG/Git config/hooks/filters/helpers/credentials/proxy/CA/SSH/askpass are
isolated. The real source checkout is read-only. Validation has no network.
The report contains only IDs, digests, bounded counts, statuses, exit
classifications and safe reasons; never raw source, prompts, model output,
credentials or runtime packets.

**End state:** `DELIVERY_READY_MANUAL` only. No remote authority is granted.
