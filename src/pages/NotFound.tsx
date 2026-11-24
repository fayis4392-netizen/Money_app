import { Link } from 'react-router-dom'
import { Card } from '@/components/ui'

export default function NotFound() {
  return (
    <Card className="py-14 text-center">
      <div className="text-base font-bold">Page not found</div>
      <p className="mt-1 text-sm text-muted"><Link className="text-accent" to="/">Go to the dashboard</Link></p>
    </Card>
  )
}
