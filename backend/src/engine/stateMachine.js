/**
 * Delivery Ecosystem State Machine
 * Defines valid transitions for Orders and Delivery Jobs.
 */

class StateTransitionError extends Error {
  constructor(entity, fromState, toState) {
    super(`Invalid ${entity} transition from ${fromState} to ${toState}`);
    this.name = 'StateTransitionError';
    this.entity = entity;
    this.fromState = fromState;
    this.toState = toState;
  }
}

// Valid Order Transitions
const ORDER_TRANSITIONS = {
  CREATED: ['PENDING_VERIFICATION', 'CANCELLED'],
  PENDING_VERIFICATION: ['VERIFIED_READY', 'CANCELLED'],
  VERIFIED_READY: ['PACKED', 'CANCELLED'],
  PACKED: ['DISPATCHED_TO_3PL', 'CANCELLED'],
  DISPATCHED_TO_3PL: ['DELIVERED', 'DELIVERY_FAILED_DISPUTED', 'CANCELLED'], 
  DELIVERED: [], // Terminal state
  DELIVERY_FAILED_DISPUTED: ['VERIFIED_READY', 'CANCELLED'],
  CANCELLED: [] // Terminal state
};

// Valid Delivery Transitions
const DELIVERY_TRANSITIONS = {
  PENDING: ['ASSIGNED', 'FAILED'],
  ASSIGNED: ['DISPATCHED', 'FAILED'],
  DISPATCHED: ['NEARBY', 'FAILED'],
  NEARBY: ['DELIVERED', 'FAILED'],
  DELIVERED: [], // Terminal state
  FAILED: [] // Terminal state
};

/**
 * Asserts that transitioning an order from `fromState` to `toState` is allowed.
 * @param {string} fromState 
 * @param {string} toState 
 * @throws {StateTransitionError} if the transition is invalid.
 */
function assertOrderTransition(fromState, toState) {
  const allowed = ORDER_TRANSITIONS[fromState];
  if (!allowed || !allowed.includes(toState)) {
    throw new StateTransitionError('Order', fromState, toState);
  }
}

/**
 * Asserts that transitioning a delivery job from `fromState` to `toState` is allowed.
 * @param {string} fromState 
 * @param {string} toState 
 * @throws {StateTransitionError} if the transition is invalid.
 */
function assertDeliveryTransition(fromState, toState) {
  const allowed = DELIVERY_TRANSITIONS[fromState];
  if (!allowed || !allowed.includes(toState)) {
    throw new StateTransitionError('DeliveryJob', fromState, toState);
  }
}

module.exports = {
  StateTransitionError,
  assertOrderTransition,
  assertDeliveryTransition,
  ORDER_TRANSITIONS,
  DELIVERY_TRANSITIONS
};
