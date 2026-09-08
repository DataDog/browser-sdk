import { redirect } from 'next/navigation'

export default function redirectPage() {
  redirect('/user/123')
}
