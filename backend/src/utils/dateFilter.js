export function buildDateRangeFilter(startDate, endDate, field = 'createdAt') {
  if (!startDate && !endDate) return {};

  const range = {};
  if (startDate) {
    range.$gte = new Date(startDate);
  }
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }

  return { [field]: range };
}
