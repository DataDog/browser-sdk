import { Button, Group, TextInput } from '@mantine/core'
import React, { useState } from 'react'
import classes from './vulnerabilitiesTabTop.module.css'

export function VulnerabilitiesTabTop({
  readVulnerabilities,
  clear,
}: {
  readVulnerabilities: (path: string) => void
  clear: () => void
}) {
  const [filePath, setFilePath] = useState<string>('')
  
  return (
    <Group className="dd-privacy-allow">
      <TextInput
        placeholder="Filepath of tracer output"
        value={filePath}
        className={classes.textInput}
        onChange={(event) => setFilePath(event.currentTarget.value)} //TODO debounce this
        data-dd-privacy="mask"
      />
      <Button color="violet" variant="light" disabled={filePath.length === 0} onClick={() => readVulnerabilities(filePath)}>
        Read
      </Button>
      <Button color="red" variant="light" onClick={clear}>
        Clear
      </Button>
    </Group>
  )
}
