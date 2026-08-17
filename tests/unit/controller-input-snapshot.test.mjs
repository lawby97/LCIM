import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { snapshotControllerInputs, runController } from '../../src/controller/orchestrator.mjs';
import { mintSolTestSeam } from '../../src/controller/test-seams.mjs';
import { ConfigError } from '../../src/shared/errors.mjs';

test('controller refuses accessor-backed SOL transport input before any asynchronous work', async () => {
  let getterCalls = 0;
  const options = { cwd: process.cwd(), testCapability: mintSolTestSeam() };
  Object.defineProperty(options, 'solTransportOptions', {
    enumerable: true,
    get() { getterCalls += 1; return { piBin: '/tmp/attacker-pi' }; },
  });
  await assert.rejects(runController(options), ConfigError);
  assert.equal(getterCalls, 0, 'authority getters must never be evaluated');
});

test('controller snapshots and freezes mutable SOL transport data synchronously', () => {
  const transport = { piBin: path.resolve('/tmp', 'initial-fixture-pi') };
  const inputs = snapshotControllerInputs({
    cwd: process.cwd(),
    solTransportOptions: transport,
    testCapability: mintSolTestSeam(),
  });
  transport.piBin = path.resolve('/tmp', 'mutated-after-snapshot');
  assert.equal(inputs.solTransportOptions.piBin, path.resolve('/tmp', 'initial-fixture-pi'));
  assert.equal(Object.isFrozen(inputs.solTransportOptions), true);
  assert.equal(inputs.hasTestSeam, true);
});

test('public project injection is rejected even when it resembles normalized internal project data', async () => {
  await assert.rejects(
    runController({
      cwd: process.cwd(),
      project: {
        repoDir: '/tmp/attacker-target',
        config: { sol: { seamAuthorized: true }, endpoints: {} },
        configDigest: '0'.repeat(64),
      },
    }),
    /project injection is not supported/,
  );
});

test('production options reject process-table injection; an opaque test capability stays non-authoritative', () => {
  const table = { list: () => [], listWithEnv: () => [], kill: () => true };
  // A raw process table is not part of the production controller API, even
  // if a caller also supplies an opaque capability.
  assert.throws(
    () => snapshotControllerInputs({
      cwd: process.cwd(),
      processSupervisorOptions: { processTable: table },
      testCapability: mintSolTestSeam(),
    }),
    /unsupported processSupervisorOptions\.processTable/,
  );
  // Tests may capture the table only inside the module-private capability;
  // snapshot output carries no callable table and the run is permanently
  // non-authoritative.
  const inputs = snapshotControllerInputs({
    cwd: process.cwd(),
    processSupervisorOptions: { terminateGraceMs: 100 },
    testCapability: mintSolTestSeam({ processTable: table }),
  });
  assert.equal(inputs.hasTestSeam, true);
  assert.equal(inputs.hasTestProcessTable, true);
  assert.equal(Object.isFrozen(inputs.processSupervisorOptions), true);
  assert.equal(Object.hasOwn(inputs.processSupervisorOptions, 'processTable'), false);
});
