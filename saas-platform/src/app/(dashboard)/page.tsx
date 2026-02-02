export default function DashboardPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 bg-card rounded-lg border">
          <h3 className="text-sm font-medium text-muted-foreground">Messages Today</h3>
          <p className="text-3xl font-bold mt-2">0</p>
        </div>

        <div className="p-6 bg-card rounded-lg border">
          <h3 className="text-sm font-medium text-muted-foreground">Active Sessions</h3>
          <p className="text-3xl font-bold mt-2">0</p>
        </div>

        <div className="p-6 bg-card rounded-lg border">
          <h3 className="text-sm font-medium text-muted-foreground">Connected Channels</h3>
          <p className="text-3xl font-bold mt-2">0</p>
        </div>
      </div>
    </div>
  )
}
