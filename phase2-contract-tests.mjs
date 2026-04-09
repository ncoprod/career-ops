#!/usr/bin/env node

/**
 * phase2-contract-tests.mjs
 *
 * Phase 2 contract checks:
 * - Canonical schema structure
 * - Canonical fixture validity
 * - Serialization round-trip stability
 * - Provider routing behavior
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { selectProviderForTask, TASK_REQUIREMENTS, SUPPORTED_PRIVACY_MODES } from './platform/provider-routing.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

const SCHEMA_PATH = join(ROOT, 'docs', 'product', 'phase2', 'schemas', 'canonical-model-v1.schema.json');
const SAMPLE_PATH = join(ROOT, 'fixtures', 'phase2', 'canonical-model-v1.sample.json');

const BASE_REQUIRED = [
  'entityType',
  'id',
  'version',
  'createdAt',
  'updatedAt',
  'provenance',
  'review'
];

const REVIEW_STATUSES = new Set(['pending', 'approved', 'rejected', 'n/a']);
const SOURCE_TYPES = new Set(['user', 'ai', 'import', 'system']);

const ENTITY_REQUIRED_FIELDS = {
  UserProfile: ['displayName', 'headline', 'summary', 'location', 'email'],
  Experience: ['profileId', 'company', 'role', 'startDate', 'highlights'],
  Project: ['profileId', 'name', 'description', 'impactSummary'],
  Achievement: ['profileId', 'title', 'metric', 'context'],
  Skill: ['profileId', 'name', 'category', 'level'],
  Preference: ['profileId', 'workMode', 'targetRegions', 'salaryMin', 'salaryMax'],
  RoleTarget: ['profileId', 'title', 'priority', 'keywords'],
  Offer: ['source', 'sourceUrl', 'company', 'role', 'rawText', 'capturedAt'],
  OfferAnalysis: ['offerId', 'overallScore', 'dimensionScores', 'recommendation', 'rationale'],
  CVVariant: ['offerId', 'profileId', 'contentMarkdown', 'exportPaths'],
  Suggestion: ['targetEntityId', 'targetField', 'currentValue', 'proposedValue', 'confidence'],
  SuggestionDecision: ['suggestionId', 'decision', 'decidedBy', 'decidedAt'],
  PipelineEvent: ['eventType', 'entityRef', 'payload', 'occurredAt']
};

const EXPECTED_ENTITY_TYPES = Object.keys(ENTITY_REQUIRED_FIELDS);

let passed = 0;
let failed = 0;

function pass(msg) {
  console.log(`  PASS ${msg}`);
  passed += 1;
}

function fail(msg) {
  console.log(`  FAIL ${msg}`);
  failed += 1;
}

function assert(condition, successMsg, failureMsg) {
  if (condition) {
    pass(successMsg);
    return true;
  }
  fail(failureMsg);
  return false;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (error) {
    throw new Error(`Unable to read JSON at ${path}: ${error.message}`);
  }
}

function isIsoDateTime(value) {
  if (typeof value !== 'string') return false;
  if (!value.includes('T')) return false;
  if (!/Z$/.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

function validateSchema(schema) {
  console.log('\n1. Canonical schema checks');

  assert(schema.type === 'object', 'Schema root type is object', 'Schema root type must be object');
  assert(typeof schema.$defs === 'object' && schema.$defs !== null, 'Schema has $defs', 'Schema is missing $defs');
  assert(Array.isArray(schema.required) && schema.required.includes('entities'), 'Schema requires entities[] at root', 'Schema must require entities[] at root');
  assert(Boolean(schema.properties?.entities), 'Schema defines entities[] at root', 'Schema must define entities[] at root');

  const baseRecord = schema.$defs?.BaseRecord;
  assert(!!baseRecord, 'BaseRecord exists', 'BaseRecord is missing');
  if (baseRecord) {
    const required = new Set(baseRecord.required ?? []);
    const hasAll = BASE_REQUIRED.every((field) => required.has(field));
    assert(hasAll, 'BaseRecord required fields are complete', 'BaseRecord required fields are incomplete');
  }
  assert(Boolean(schema.$defs?.UtcDateTime), 'UtcDateTime schema exists', 'UtcDateTime schema is missing');

  for (const type of EXPECTED_ENTITY_TYPES) {
    const def = schema.$defs?.[type];
    const exists = assert(!!def, `${type} definition exists`, `${type} definition is missing`);
    if (!exists) continue;

    const allOf = Array.isArray(def.allOf) ? def.allOf : [];
    const hasBaseRef = allOf.some((part) => part.$ref === '#/$defs/BaseRecord');
    assert(hasBaseRef, `${type} extends BaseRecord`, `${type} must reference BaseRecord`);

    const typedPart = allOf.find((part) => part.properties?.entityType?.const === type);
    const hasTypedPart = assert(!!typedPart, `${type} has entityType const`, `${type} missing entityType const`);
    if (!hasTypedPart) continue;

    const required = new Set(typedPart.required ?? []);
    const hasEntityType = required.has('entityType');
    assert(hasEntityType, `${type} requires entityType`, `${type} must require entityType`);

    const fields = ENTITY_REQUIRED_FIELDS[type];
    const hasFields = fields.every((field) => required.has(field));
    assert(hasFields, `${type} required fields declared`, `${type} required fields mismatch`);
  }
}

function validateWithAjv(schema, sample) {
  console.log('\n2. JSON Schema runtime validation');
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const valid = validate(sample);
  if (valid) {
    pass('Fixture validates against canonical JSON Schema (Ajv)');
    return;
  }
  const summary = (validate.errors ?? [])
    .slice(0, 3)
    .map((error) => `${error.instancePath || '/'} ${error.message}`)
    .join(' | ');
  fail(`Fixture does not validate against canonical JSON Schema: ${summary}`);
}

function validateBaseRecord(entity) {
  for (const field of BASE_REQUIRED) {
    if (!(field in entity)) return false;
  }
  if (typeof entity.id !== 'string' || entity.id.length === 0) return false;
  if (!Number.isInteger(entity.version) || entity.version < 1) return false;
  if (!isIsoDateTime(entity.createdAt) || !isIsoDateTime(entity.updatedAt)) return false;
  if (Date.parse(entity.updatedAt) < Date.parse(entity.createdAt)) return false;

  if (typeof entity.provenance !== 'object' || entity.provenance === null) return false;
  if (!SOURCE_TYPES.has(entity.provenance.sourceType)) return false;
  if (typeof entity.provenance.sourceRef !== 'string') return false;
  if (typeof entity.provenance.actor !== 'string') return false;

  if (typeof entity.review !== 'object' || entity.review === null) return false;
  if (!REVIEW_STATUSES.has(entity.review.status)) return false;
  if (entity.review.reviewedAt !== undefined && !isIsoDateTime(entity.review.reviewedAt)) return false;
  if (entity.review.reviewer !== undefined && typeof entity.review.reviewer !== 'string') return false;

  return true;
}

function validateFixture(sample) {
  console.log('\n3. Canonical fixture checks');

  const hasEntities = Array.isArray(sample.entities);
  assert(hasEntities, 'Fixture has entities array', 'Fixture must contain entities[]');
  if (!hasEntities) return;

  const entities = sample.entities;
  assert(entities.length > 0, 'Fixture has at least one entity', 'Fixture entities[] cannot be empty');

  const ids = new Set();
  const idsByType = new Map();
  const typeCounts = new Map();

  for (let i = 0; i < entities.length; i += 1) {
    const entity = entities[i];
    const label = `entity[${i}]`;

    const knownType = EXPECTED_ENTITY_TYPES.includes(entity.entityType);
    assert(knownType, `${label} has known entityType`, `${label} has unknown entityType "${entity.entityType}"`);
    if (!knownType) continue;

    assert(validateBaseRecord(entity), `${label} base envelope valid`, `${label} base envelope invalid`);

    const required = ENTITY_REQUIRED_FIELDS[entity.entityType];
    const hasRequired = required.every((field) => field in entity);
    assert(hasRequired, `${label} type fields valid`, `${label} missing required fields for ${entity.entityType}`);

    const idUnique = !ids.has(entity.id);
    assert(idUnique, `${label} id unique`, `${label} duplicates id "${entity.id}"`);
    ids.add(entity.id);

    if (!idsByType.has(entity.entityType)) {
      idsByType.set(entity.entityType, new Set());
    }
    idsByType.get(entity.entityType).add(entity.id);
    typeCounts.set(entity.entityType, (typeCounts.get(entity.entityType) ?? 0) + 1);

    if (entity.entityType === 'Preference') {
      const rangeOk = typeof entity.salaryMin === 'number' &&
        typeof entity.salaryMax === 'number' &&
        entity.salaryMin <= entity.salaryMax;
      assert(rangeOk, `${label} salary range valid`, `${label} salaryMin must be <= salaryMax`);
    }

    if (entity.entityType === 'RoleTarget') {
      const priorityOk = Number.isInteger(entity.priority) && entity.priority >= 1 && entity.priority <= 5;
      assert(priorityOk, `${label} priority range valid`, `${label} priority must be integer 1..5`);
    }

    if (entity.entityType === 'OfferAnalysis') {
      const scoreOk = typeof entity.overallScore === 'number' && entity.overallScore >= 1 && entity.overallScore <= 5;
      assert(scoreOk, `${label} score range valid`, `${label} overallScore must be in [1,5]`);
    }

    if (entity.entityType === 'Suggestion') {
      const confidenceOk = typeof entity.confidence === 'number' && entity.confidence >= 0 && entity.confidence <= 1;
      assert(confidenceOk, `${label} confidence range valid`, `${label} confidence must be in [0,1]`);
    }
  }

  for (const type of EXPECTED_ENTITY_TYPES) {
    const present = (typeCounts.get(type) ?? 0) > 0;
    assert(present, `${type} represented in fixture`, `Fixture missing ${type}`);
  }

  const offers = idsByType.get('Offer') ?? new Set();
  const profiles = idsByType.get('UserProfile') ?? new Set();
  const suggestions = idsByType.get('Suggestion') ?? new Set();

  for (let i = 0; i < entities.length; i += 1) {
    const entity = entities[i];
    const label = `entity[${i}]`;

    if (entity.entityType === 'Experience' ||
        entity.entityType === 'Project' ||
        entity.entityType === 'Achievement' ||
        entity.entityType === 'Skill' ||
        entity.entityType === 'Preference' ||
        entity.entityType === 'RoleTarget' ||
        entity.entityType === 'CVVariant') {
      assert(profiles.has(entity.profileId), `${label} profileId reference valid`, `${label} profileId must reference UserProfile`);
    }

    if (entity.entityType === 'OfferAnalysis' || entity.entityType === 'CVVariant') {
      assert(offers.has(entity.offerId), `${label} offerId reference valid`, `${label} offerId must reference Offer`);
    }

    if (entity.entityType === 'SuggestionDecision') {
      assert(suggestions.has(entity.suggestionId), `${label} suggestion reference valid`, `${label} suggestionId must reference Suggestion`);
      const decisionOk = entity.decision === 'approved' || entity.decision === 'rejected';
      assert(decisionOk, `${label} decision enum valid`, `${label} decision must be approved or rejected`);
      assert(isIsoDateTime(entity.decidedAt), `${label} decidedAt is date-time`, `${label} decidedAt must be date-time`);
    }

    if (entity.entityType === 'Suggestion') {
      assert(ids.has(entity.targetEntityId), `${label} target reference valid`, `${label} targetEntityId must reference an existing entity id`);
    }

    if (entity.review?.status === 'approved' || entity.review?.status === 'rejected') {
      const reviewedAtOk = isIsoDateTime(entity.review.reviewedAt);
      const reviewerOk = typeof entity.review.reviewer === 'string' && entity.review.reviewer.trim().length > 0;
      assert(reviewedAtOk, `${label} review timestamp valid`, `${label} approved/rejected review must include ISO reviewedAt`);
      assert(reviewerOk, `${label} review actor valid`, `${label} approved/rejected review must include reviewer`);
    }
  }
}

function validateSerialization(sample) {
  console.log('\n4. Serialization round-trip checks');

  const serialized = JSON.stringify(sample);
  const roundTrip = JSON.parse(serialized);

  const originalCount = sample.entities?.length ?? 0;
  const roundTripCount = roundTrip.entities?.length ?? -1;
  assert(originalCount === roundTripCount, 'Entity count stable after round-trip', 'Entity count changed after round-trip');

  const fingerprint = (entities) => entities
    .map((entity) => `${entity.entityType}:${entity.id}:${entity.version}`)
    .sort()
    .join('|');

  const originalFingerprint = fingerprint(sample.entities ?? []);
  const roundTripFingerprint = fingerprint(roundTrip.entities ?? []);
  assert(
    originalFingerprint === roundTripFingerprint,
    'Entity identity fingerprint stable after round-trip',
    'Entity identity fingerprint changed after round-trip'
  );

  const metadataFingerprint = (entities) => entities
    .map((entity) => JSON.stringify({
      entityType: entity.entityType,
      id: entity.id,
      version: entity.version,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      provenance: entity.provenance,
      review: entity.review
    }))
    .sort()
    .join('|');

  assert(
    metadataFingerprint(sample.entities ?? []) === metadataFingerprint(roundTrip.entities ?? []),
    'Required metadata preserved after round-trip',
    'Required metadata changed after round-trip'
  );
}

function validateProviderRouting() {
  console.log('\n5. Provider routing checks');

  const requiredTasks = ['offer_analysis', 'profile_rewrite', 'cv_targeting', 'deep_research'];
  for (const task of requiredTasks) {
    assert(Boolean(TASK_REQUIREMENTS[task]), `TASK_REQUIREMENTS includes ${task}`, `TASK_REQUIREMENTS missing ${task}`);
  }
  const requiredPrivacyModes = ['balanced', 'privacy_preferred', 'high_privacy', 'strict_local'];
  for (const mode of requiredPrivacyModes) {
    assert(SUPPORTED_PRIVACY_MODES.has(mode), `SUPPORTED_PRIVACY_MODES includes ${mode}`, `SUPPORTED_PRIVACY_MODES missing ${mode}`);
  }

  const providers = [
    { id: 'local-lite', kind: 'local', capabilities: { rewrite: 5, reasoning: 3, structuredOutput: 2, privacyLevel: 3 } },
    { id: 'managed-pro', kind: 'managed', capabilities: { rewrite: 4, reasoning: 5, structuredOutput: 4, privacyLevel: 2 } },
    { id: 'byok-mid', kind: 'byok', capabilities: { rewrite: 4, reasoning: 4, structuredOutput: 3, privacyLevel: 3 } },
    { id: 'managed-offline', kind: 'managed', available: false, capabilities: { rewrite: 5, reasoning: 5, structuredOutput: 5 } }
  ];

  const deepResearch = selectProviderForTask({
    task: 'deep_research',
    privacyMode: 'balanced',
    providers
  });
  assert(deepResearch.primary === 'managed-pro', 'Deep research selects best managed provider', 'Deep research provider selection mismatch');

  const strictLocal = selectProviderForTask({
    task: 'profile_rewrite',
    privacyMode: 'strict_local',
    providers
  });
  assert(strictLocal.primary === 'local-lite', 'Strict local mode picks local provider', 'Strict local mode did not pick local provider');

  const noLocalCompatible = selectProviderForTask({
    task: 'profile_rewrite',
    privacyMode: 'strict_local',
    providers: [
      { id: 'local-weak', kind: 'local', capabilities: { rewrite: 1, reasoning: 1, structuredOutput: 1 } },
      { id: 'managed-strong', kind: 'managed', capabilities: { rewrite: 5, reasoning: 5, structuredOutput: 5 } }
    ]
  });
  assert(noLocalCompatible.primary === null, 'Strict local mode returns null when no local provider is compatible', 'Strict local mode should return null when no local provider is compatible');

  const highPrivacy = selectProviderForTask({
    task: 'offer_analysis',
    privacyMode: 'high_privacy',
    providers: [
      { id: 'managed-low-privacy', kind: 'managed', capabilities: { rewrite: 4, reasoning: 4, structuredOutput: 3, privacyLevel: 1 } },
      { id: 'managed-high-privacy', kind: 'managed', capabilities: { rewrite: 4, reasoning: 4, structuredOutput: 3, privacyLevel: 3 } }
    ]
  });
  assert(highPrivacy.primary === 'managed-high-privacy', 'High privacy mode prefers higher privacyLevel provider', 'High privacy mode did not prefer higher privacyLevel provider');

  const tieBreaker = selectProviderForTask({
    task: 'offer_analysis',
    privacyMode: 'balanced',
    providers: [
      { id: 'beta', kind: 'managed', capabilities: { rewrite: 3, reasoning: 4, structuredOutput: 3 } },
      { id: 'alpha', kind: 'managed', capabilities: { rewrite: 3, reasoning: 4, structuredOutput: 3 } }
    ]
  });
  assert(tieBreaker.primary === 'alpha', 'Provider tie-breaker is deterministic by id', 'Provider tie-breaker must be deterministic by id');

  let unsupportedTaskThrows = false;
  try {
    selectProviderForTask({
      task: 'unknown_task',
      providers
    });
  } catch (error) {
    unsupportedTaskThrows = /Unsupported task/.test(String(error.message));
  }
  assert(unsupportedTaskThrows, 'Unsupported task throws explicit error', 'Unsupported task must throw explicit error');

  let unsupportedPrivacyModeThrows = false;
  try {
    selectProviderForTask({
      task: 'offer_analysis',
      privacyMode: 'typo_mode',
      providers
    });
  } catch (error) {
    unsupportedPrivacyModeThrows = /Unsupported privacyMode/.test(String(error.message));
  }
  assert(unsupportedPrivacyModeThrows, 'Unsupported privacyMode throws explicit error', 'Unsupported privacyMode must throw explicit error');

  let invalidProviderIdThrows = false;
  try {
    selectProviderForTask({
      task: 'offer_analysis',
      providers: [
        { id: 123, kind: 'managed', capabilities: { rewrite: 5, reasoning: 5, structuredOutput: 5 } }
      ]
    });
  } catch (error) {
    invalidProviderIdThrows = /Invalid provider id/.test(String(error.message));
  }
  assert(invalidProviderIdThrows, 'Invalid provider id fails closed', 'Invalid provider id must fail closed');
}

function main() {
  console.log('\nPhase 2 contract test suite\n');

  assert(existsSync(SCHEMA_PATH), 'Schema file exists', `Missing schema file: ${SCHEMA_PATH}`);
  assert(existsSync(SAMPLE_PATH), 'Fixture file exists', `Missing fixture file: ${SAMPLE_PATH}`);
  if (failed > 0) {
    console.log('\nPhase 2 contract checks failed\n');
    process.exit(1);
  }

  const schema = readJson(SCHEMA_PATH);
  const sample = readJson(SAMPLE_PATH);

  validateSchema(schema);
  validateWithAjv(schema, sample);
  validateFixture(sample);
  validateSerialization(sample);
  validateProviderRouting();

  console.log('\n' + '='.repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.log('Phase 2 contract checks failed\n');
    process.exit(1);
  }

  console.log('Phase 2 contract checks passed\n');
}

main();
