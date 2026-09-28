/**
 * Idempotency keys for v2 submits (student/errors.md, "Double-submit needs a backend
 * guard"). A page makes ONE key when a form/modal opens and sends it on that form's submit
 * as the `Idempotency-Key` header: a network retry or a double click inside the backend's
 * window then replays the first result instead of creating a second record. Reopening the
 * form starts a new key — that is a genuinely new submission.
 *
 * The client-side in-flight flag (the `saving`/`isClick` guard) is still the first line;
 * this is the backstop for the requests that get past it.
 */
import { HttpHeaders } from '@angular/common/http';
import { v4 as uuidv4 } from 'uuid';

export const newIdempotencyKey = (): string => uuidv4();

export const idempotencyHeaders = (key?: string): HttpHeaders | undefined =>
  key ? new HttpHeaders({ 'Idempotency-Key': key }) : undefined;
