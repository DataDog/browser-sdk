import type { TimeStamp } from '@datadog/js-core/time'
import { ChangeType, RecordType } from '../../../types'
import type { NodeId, StringId } from '../encoding'
import type { EmitRecordCallback, EmitStatsCallback } from '../record.types'
import { createRecordingScopeForTesting } from '../test/recordingScope.specHelper'
import { serializeCanvasImageContent } from './serializeCanvasImageContent'

describe('serializeCanvasImageContent', () => {
  it('emits a Change record for a canvas capture', () => {
    const emitRecord = jasmine.createSpy<EmitRecordCallback>()
    const emitStats = jasmine.createSpy<EmitStatsCallback>()
    const scope = createRecordingScopeForTesting()

    serializeCanvasImageContent(
      { nodeId: 42 as NodeId, changeHash: '100x100:abc', image: new Blob() },
      emitRecord,
      emitStats,
      scope,
      123 as TimeStamp
    )

    expect(emitRecord).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        type: RecordType.Change,
        data: jasmine.arrayContaining([[ChangeType.ImageContent, [42 as NodeId, 0 as StringId]]]),
      })
    )
  })
})
