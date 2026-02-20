async function initShell() {
  // @ts-ignore
  await Promise.all([import('app1/app1'), import('app2/app2')])
}

void initShell()
