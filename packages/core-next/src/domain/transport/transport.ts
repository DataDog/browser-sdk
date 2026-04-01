interface Transport {
  send(data: string): void
  flush(): void
}

export type { Transport }
