export default function AdminOrdersPage() {
  return (
    <div className="ui-card">
      <h1 className="text-xl font-medium mb-2">Orders</h1>
      <p className="text-text-secondary text-sm">Use admin API POST /admin/orders/:id/settle for manual settlement.</p>
    </div>
  );
}
