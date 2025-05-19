/**
 * Holds data about the variation a subject was assigned to.
 * @public
 */

export interface IAssignmentEvent {
  /** * An Eppo allocation key */
  allocation: string | null;

  /** * An Eppo experiment key */
  experiment: string | null;

  /** * An Eppo feature flag key */
  featureFlag: string;

  /** * The assigned variation */
  variation: string | null;

  /** * The entity or user that was assigned to a variation */
  subject: string;

  /** * The time the subject was exposed to the variation. */
  timestamp: string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subjectAttributes: Record<string, any>;
  [propName: string]: unknown;

  metaData?: Record<string, unknown>;

  /** * The format of the flag. */
  format: string;

  /** * The flag evaluation details. Null if the flag was precomputed. */
  // evaluationDetails: IFlagEvaluationDetails | null;

  /** * The entity ID of the subject, if present. */
  entityId?: number | null;
}

/**
 * Implement this interface log variation assignments to your data warehouse.
 * @public
 */
export interface IAssignmentLogger {
  /**
   * Invoked when a subject is assigned to an experiment variation.
   * @param assignment holds the variation an experiment subject was assigned to
   * @public
   */
  logAssignment(assignment: IAssignmentEvent): void;
}
