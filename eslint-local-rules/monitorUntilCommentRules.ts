import { AST_NODE_TYPES } from '@typescript-eslint/utils'
import { RuleCreator } from '@typescript-eslint/utils/eslint-utils'

const METHODS_TO_CHECK = ['addTelemetryDebug', 'addTelemetryMetrics'] as const
const MONITOR_COMMENT_FORMAT = /^\s*monitor-until: (\d{4}-\d{2}-\d{2}|forever)/

function isMethodToCheck(methodName: string): methodName is (typeof METHODS_TO_CHECK)[number] {
  return METHODS_TO_CHECK.includes(methodName as (typeof METHODS_TO_CHECK)[number])
}

export default {
  'enforce-monitor-until-comment': RuleCreator.withoutDocs({
    meta: {
      docs: {
        description:
          'Force to specify an expiration date to telemetry debug and metrics events in order to clean them regularly',
      },
      schema: [],
      messages: {
        missingMonitorUntilComment: 'Missing `// monitor-until: YYYY-MM-DD` or `// monitor-until: forever` comment',
      },
      type: 'suggestion',
    },
    create(context) {
      const sourceCode = context.sourceCode

      return {
        CallExpression(node) {
          if (node.callee.type !== AST_NODE_TYPES.Identifier) {
            return
          }

          const methodName = node.callee.name
          if (!isMethodToCheck(methodName)) {
            return
          }

          const monitorComment = sourceCode
            .getCommentsBefore(node)
            .find((comment) => MONITOR_COMMENT_FORMAT.test(comment.value))

          if (!monitorComment) {
            context.report({
              node,
              messageId: 'missingMonitorUntilComment',
            })
          }
        },
      }
    },
  }),
  'monitor-until-comment-expired': RuleCreator.withoutDocs({
    meta: {
      docs: {
        description: 'Report expired monitor-until comments',
      },
      schema: [],
      messages: {
        expiredMonitorUntilComment: 'Expired: {{commentValue}}',
      },
      type: 'suggestion',
    },
    create(context) {
      return {
        Program() {
          const now = new Date()
          const comments = context.sourceCode.getAllComments()
          comments.forEach((comment) => {
            const monitorCommentMatch = comment.value.match(MONITOR_COMMENT_FORMAT)
            if (!monitorCommentMatch || monitorCommentMatch[1] === 'forever') {
              return
            }

            if (new Date(monitorCommentMatch[1]) < now) {
              context.report({
                node: comment,
                messageId: 'expiredMonitorUntilComment',
                data: {
                  commentValue: comment.value,
                },
              })
            }
          })
        },
      }
    },
  }),
}
