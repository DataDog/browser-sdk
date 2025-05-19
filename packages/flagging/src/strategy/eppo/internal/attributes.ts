import { Attributes, BanditActions, BanditSubjectAttributes, ContextAttributes } from './types';

export function isInstanceOfContextualAttributes(
  attributes: unknown,
): attributes is ContextAttributes {
  return Boolean(
    typeof attributes === 'object' &&
      attributes && // exclude null
      'numericAttributes' in attributes &&
      'categoricalAttributes' in attributes,
  );
}

export function ensureNonContextualSubjectAttributes(
  subjectAttributes: BanditSubjectAttributes,
): Attributes {
  let result: Attributes;
  if (isInstanceOfContextualAttributes(subjectAttributes)) {
    const contextualSubjectAttributes = subjectAttributes;
    result = {
      ...contextualSubjectAttributes.numericAttributes,
      ...contextualSubjectAttributes.categoricalAttributes,
    };
  } else {
    // Attributes are non-contextual
    result = subjectAttributes as Attributes;
  }
  return result;
}

export function ensureContextualSubjectAttributes(
  subjectAttributes: BanditSubjectAttributes,
): ContextAttributes {
  if (isInstanceOfContextualAttributes(subjectAttributes)) {
    return subjectAttributes;
  } else {
    return deduceAttributeContext(subjectAttributes as Attributes);
  }
}

export function deduceAttributeContext(attributes: Attributes): ContextAttributes {
  const contextualAttributes: ContextAttributes = {
    numericAttributes: {},
    categoricalAttributes: {},
  };
  Object.entries(attributes).forEach(([attribute, value]) => {
    const isNumeric = typeof value === 'number';
    if (isNumeric) {
      contextualAttributes.numericAttributes[attribute] = value;
    } else {
      contextualAttributes.categoricalAttributes[attribute] = value;
    }
  });
  return contextualAttributes;
}

export function ensureActionsWithContextualAttributes(
  actions: BanditActions,
): Record<string, ContextAttributes> {
  let result: Record<string, ContextAttributes> = {};
  if (Array.isArray(actions)) {
    // no context
    actions.forEach((action) => {
      result[action] = { numericAttributes: {}, categoricalAttributes: {} };
    });
  } else if (!Object.values(actions).every(isInstanceOfContextualAttributes)) {
    // Actions have non-contextual attributes; bucket based on number or not
    Object.entries(actions).forEach(([action, attributes]) => {
      result[action] = deduceAttributeContext(attributes);
    });
  } else {
    // Actions already have contextual attributes
    result = actions as Record<string, ContextAttributes>;
  }
  return result;
}
