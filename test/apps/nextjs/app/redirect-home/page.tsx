import { redirect } from 'next/navigation'

export default function redirectHomePage() {
  redirect('/?redirected=true')
}
