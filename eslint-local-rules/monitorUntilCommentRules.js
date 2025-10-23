const METHODS_TO_CHECK = ['addTelemetryDebug', 'addTelemetryMetrics']
const MONITOR_COMMENT_FORMAT = /^\s*monitor-until: (\d{4}-\d{2}-\d{2}|forever)/

export default {
  'enforce-monitor-until-comment': {
    meta: {
      docs: {
        description:
          'Force to specify an expiration date to telemetry debug and metrics events in order to clean them regularly',
        recommended: false,
      },
      schema: [],
    },
    create(context) {
      const sourceCode = context.getSourceCode()

      return {
        CallExpression(node) {
          const methodName = node.callee.name
          if (!METHODS_TO_CHECK.includes(methodName)) {
            return
          }

          const monitorComment = sourceCode
            .getCommentsBefore(node)
            .find((comment) => MONITOR_COMMENT_FORMAT.test(comment.value))

          if (!monitorComment) {
            context.report(node, 'Missing `// monitor-until: YYYY-MM-DD` or `// monitor-until: forever` comment')
          }
        },
      }
    },
  },
  'monitor-until-comment-expired': {
    meta: {
      docs: {
        description: 'Report expired monitor-until comments',
        recommended: false,
      },
      schema: [],
    },
    create(context) {
      return {
        Program() {
          const now = new Date()
          const comments = context.getSourceCode().getAllComments()
          comments.forEach((comment) => {
            const monitorCommentMatch = comment.value.match(MONITOR_COMMENT_FORMAT)
            if (!monitorCommentMatch || monitorCommentMatch[1] === 'forever') {
              return
            }

            if (new Date(monitorCommentMatch[1]) < now) {
              context.report(comment, `Expired: ${comment.value}`)
            }
          })
        },
      }
    },
  },
}
