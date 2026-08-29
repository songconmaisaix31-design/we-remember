import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateAuditLogEntry,
  validateConsent,
  validateEvidence,
  validateFamilyEvent,
  validateHandover,
  validateMember,
  validateReminderPlan,
  validateResponsibilityDomain,
  validateTodo,
} from './index.mjs';

const timestamp = '2026-08-30T09:15:00.123Z';
const member = { id: 'mother', familyId: 'family-1', displayName: 'Mother', kind: 'human', version: 1 };
const domain = {
  id: 'care', familyId: 'family-1', title: 'Grandmother care', accountableOwnerId: 'mother',
  status: 'active', scopeIncluded: ['appointments'], scopeExcluded: ['finances'], nextActionId: null,
  visibility: 'family', evidenceIds: ['evidence-1'], version: 1,
};
const records = [
  [validateMember, member],
  [validateResponsibilityDomain, domain],
  [validateFamilyEvent, { id: 'event-1', familyId: 'family-1', title: 'Visit', startsAt: timestamp, participantIds: ['mother'], supportMemberIds: [], informedMemberIds: ['father'], domainId: 'care' }],
  [validateTodo, { id: 'todo-1', familyId: 'family-1', title: 'Book visit', domainId: 'care', assigneeId: 'mother', assignmentBasis: 'domain_owner', dueAt: null, status: 'open', version: 1 }],
  [validateHandover, { id: 'handover-1', familyId: 'family-1', domainId: 'care', fromOwnerId: 'mother', proposedOwnerId: 'father', status: 'pending_ack', missingFields: [], confirmationRequiredFromId: 'father', acknowledgements: [{ memberId: 'father', handoverVersion: 1, acknowledgedAt: timestamp }], expectedDomainVersion: 1, expiresAt: timestamp, version: 1 }],
  [validateEvidence, { id: 'evidence-1', familyId: 'family-1', subjectMemberId: 'grandmother', createdByMemberId: 'mother', kind: 'shareable_fact', visibility: 'private', content: 'Needs a follow-up.', version: 1 }],
  [validateConsent, { id: 'consent-1', evidenceId: 'evidence-1', subjectMemberId: 'grandmother', grantedVisibility: 'family', status: 'granted', version: 1 }],
  [validateReminderPlan, { id: 'reminder-1', sourceType: 'todo', sourceId: 'todo-1', sourceVersion: 1, routingBasis: 'todo_assignee', recipientId: 'mother', status: 'pending' }],
  [validateAuditLogEntry, { id: 'audit-1', familyId: 'family-1', actorId: 'father', action: 'handover_accepted', entityType: 'handover', entityId: 'handover-1', occurredAt: timestamp, metadata: { version: 1, migrated: true, note: null } }],
];

test('accepts every frozen record shape and returns a deep immutable clone', () => {
  for (const [validator, value] of records) {
    const result = validator(value);
    assert.equal(result.ok, true);
    assert.notEqual(result.value, value);
    assert.equal(Object.isFrozen(result.value), true);
  }
  const result = validateResponsibilityDomain(domain);
  assert.equal(Object.isFrozen(result.value.scopeIncluded), true);
  assert.throws(() => result.value.scopeIncluded.push('extra'), TypeError);
});

test('rejects missing and unknown fields without exposing external content', () => {
  const missing = { ...domain };
  delete missing.scopeExcluded;
  const extra = { ...domain, defaultReminderRecipientId: 'attacker' };
  for (const result of [validateResponsibilityDomain(missing), validateResponsibilityDomain(extra)]) {
    assert.deepEqual(result, { ok: false, error: { code: 'INVALID_RECORD', message: 'Record validation failed.' } });
    assert.equal(JSON.stringify(result).includes('attacker'), false);
  }
  assert.equal(validateReminderPlan({ ...records[7][1], defaultRecipientId: 'father' }).ok, false);
});

test('rejects invalid enum, timestamp, duplicate arrays, and non-positive versions', () => {
  assert.equal(validateTodo({ ...records[3][1], status: 'waiting' }).ok, false);
  assert.equal(validateFamilyEvent({ ...records[2][1], startsAt: 'not-a-time' }).ok, false);
  assert.equal(validateFamilyEvent({ ...records[2][1], participantIds: ['mother', 'mother'] }).ok, false);
  assert.equal(validateEvidence({ ...records[5][1], version: 0 }).ok, false);
  assert.equal(validateHandover({ ...records[4][1], status: 'cancelled' }).ok, false);
  assert.equal(validateHandover({ ...records[4][1], acknowledgements: [{ memberId: 'father', handoverVersion: 1, acknowledgedAt: timestamp }, { memberId: 'father', handoverVersion: 1, acknowledgedAt: timestamp }] }).ok, false);
});

test('enforces bounded nonempty identifiers and text', () => {
  assert.equal(validateMember({ ...member, id: '' }).ok, false);
  assert.equal(validateMember({ ...member, displayName: 'x'.repeat(4097) }).ok, false);
  assert.equal(validateAuditLogEntry({ ...records[8][1], action: '' }).ok, false);
  assert.equal(validateAuditLogEntry({ ...records[8][1], metadata: { unsafe: Infinity } }).ok, false);
});
