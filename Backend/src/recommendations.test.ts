import assert from 'node:assert/strict';
import test from 'node:test';
import { isCurrentStoryProfile, isValidStoryAnswers, makeDna, normalizedTagScore, recommendationReason, storyChoiceOptions } from './index';

const remainingAnswers = ['0', '0', '0', '0', '0'];

test('each visual story choice stores its complete ranking tags', () => {
  for (const [index, choice] of storyChoiceOptions.entries()) {
    const result = makeDna([String(index), ...remainingAnswers]);
    assert.equal(result.dna.storyChoice, choice.title);
    assert.deepEqual(result.dna.storyTags, choice.tags);
  }
});

test('questionnaire validation accepts three first-question choices only', () => {
  assert.equal(isValidStoryAnswers(['0', ...remainingAnswers]), true);
  assert.equal(isValidStoryAnswers(['2', ...remainingAnswers]), true);
  assert.equal(isValidStoryAnswers(['3', ...remainingAnswers]), false);
  assert.equal(isValidStoryAnswers(['0', '4', '0', '0', '0', '0']), false);
});

test('current profile version and story tags influence ranking reasons', () => {
  const dna = makeDna(['0', ...remainingAnswers]).dna;
  assert.equal(isCurrentStoryProfile(dna), true);
  assert.equal(isCurrentStoryProfile({ genre: 'mystery' }), false);
  assert.ok(normalizedTagScore(['mystery', 'clues'], dna) > 0);
  assert.match(recommendationReason(['mystery', 'clues'], dna), /mystery|clues/);
});
