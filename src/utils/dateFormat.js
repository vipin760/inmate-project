const formatDateToYYYYMMDD = (dateStr) => {
  const date = new Date(dateStr);
  if (isNaN(date)) return null;
  return date.toISOString().split('T')[0];
};

module.exports = formatDateToYYYYMMDD;