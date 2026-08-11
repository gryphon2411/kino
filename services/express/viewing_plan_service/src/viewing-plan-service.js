import { InvalidRequestError, NotFoundError } from './errors.js';

export const VIEWING_PLAN_READ_SCOPE = 'kino.viewing-plan.read';
export const VIEWING_PLAN_WRITE_SCOPE = 'kino.viewing-plan.write';

/**
 * @typedef {object} ViewingPlan
 * @property {string} id
 * @property {string} titleId
 * @property {'WATCH'|'REWATCH'} kind
 * @property {'OPEN'|'DONE'} status
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string|null} completedAt
 */

/**
 * @typedef {object} ViewingPlanRepository
 * @property {(subject: string, status: 'OPEN'|'DONE', page: number, size: number) => Promise<{items: ViewingPlan[], page: number, size: number, hasNext: boolean}>} list
 * @property {(subject: string, titleId: string) => Promise<ViewingPlan|null>} openForTitle
 * @property {(subject: string, titleId: string, kind: 'WATCH'|'REWATCH') => Promise<ViewingPlan>} upsert
 * @property {(subject: string, id: string, status: 'OPEN'|'DONE') => Promise<ViewingPlan|null>} transition
 * @property {(subject: string, id: string) => Promise<boolean>} delete
 */

export function isTitleId(value) {
  return typeof value === 'string' && /^tt\d{1,30}$/.test(value);
}

export function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function kind(value) {
  if (value !== 'WATCH' && value !== 'REWATCH') {
    throw new InvalidRequestError();
  }
  return value;
}

export class ViewingPlanService {
  /** @param {ViewingPlanRepository} repository */
  constructor(repository) {
    this.repository = repository;
  }

  async list(subject, status, page, size) {
    return this.repository.list(subject, status, page, size);
  }

  async openForTitle(subject, titleId) {
    return this.repository.openForTitle(subject, titleId);
  }

  async upsert(subject, titleId, input) {
    return this.repository.upsert(subject, titleId, kind(input.kind));
  }

  async complete(subject, id) {
    const plan = await this.repository.transition(subject, id, 'DONE');
    if (!plan) {
      throw new NotFoundError();
    }
    return plan;
  }

  async reopen(subject, id) {
    const plan = await this.repository.transition(subject, id, 'OPEN');
    if (!plan) {
      throw new NotFoundError();
    }
    return plan;
  }

  async delete(subject, id) {
    if (!(await this.repository.delete(subject, id))) {
      throw new NotFoundError();
    }
  }
}
