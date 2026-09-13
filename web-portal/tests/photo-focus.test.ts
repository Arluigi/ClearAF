import { test } from 'node:test';
import assert from 'node:assert/strict';
import './env';
import { restorePhotoFocus } from '../src/components/patients/PatientPhotoHistory';

test('dialog close autofocus restores the originating photo button', () => {
  let focused = 'dialog';
  const event = new Event('closeAutoFocus', { cancelable: true });
  const origin = { isConnected: true, focus: () => { focused = 'photo-button'; } };
  const fallback = { isConnected: true, focus: () => { focused = 'photo-history'; } };
  restorePhotoFocus(event, origin, fallback);
  assert.equal(event.defaultPrevented, true);
  assert.equal(focused, 'photo-button');
});

test('a photo removed by refresh falls back to the labelled history section', () => {
  let focused = 'dialog';
  const event = new Event('closeAutoFocus', { cancelable: true });
  const removed = { isConnected: false, focus: () => { focused = 'removed-button'; } };
  const fallback = { isConnected: true, focus: () => { focused = 'photo-history'; } };
  restorePhotoFocus(event, removed, fallback);
  assert.equal(event.defaultPrevented, true);
  assert.equal(focused, 'photo-history');
});

test('closing the outer patient review does not refocus disconnected elements', () => {
  let focused = false;
  const disconnected = { isConnected: false, focus: () => { focused = true; } };
  restorePhotoFocus(new Event('closeAutoFocus'), disconnected, disconnected);
  assert.equal(focused, false);
});
