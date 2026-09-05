const TEXT_FIELDS = ['role', 'title', 'company', 'location', 'workMode', 'modality', 'contract', 'seniority', 'salary'];

export function applyCampaignFilters(opportunity = {}, filters = {}, facts = {}) {
  const reasons = [];
  const observed = observedText(opportunity);

  reject(filters.roles, opportunity.role ?? opportunity.title, 'cargo', reasons);
  reject(filters.seniority, opportunity.seniority, 'senioridade', reasons);
  reject(filters.locations, opportunity.location, 'local', reasons);
  reject(filters.workModes ?? filters.modality, opportunity.workMode ?? opportunity.modality, 'modalidade', reasons);
  reject(filters.contracts, opportunity.contract, 'contrato', reasons);
  if (minimumSalary(filters) > 0 && numericSalary(opportunity.salary) > 0 && numericSalary(opportunity.salary) < minimumSalary(filters)) {
    reasons.push({ field: 'salário', rule: 'minimum', observed: opportunity.salary });
  }
  for (const exclusion of list(filters.exclusions)) {
    if (observed.includes(exclusion.toLocaleLowerCase())) reasons.push({ field: 'exclusão', rule: exclusion, observed: exclusion });
  }
  const eligible = reasons.length === 0;
  return {
    eligible,
    reasons,
    explanation: eligible
      ? 'A vaga passou pelos filtros da campanha com base nos fatos confirmados e na descrição observada.'
      : `Requisito eliminatório ou filtro impediu a seleção: ${reasons.map((item) => item.rule).join(', ')}.`
  };
}

function reject(filter, observed, field, reasons) {
  const accepted = list(filter);
  if (!accepted.length || !String(observed ?? '').trim()) return;
  const value = String(observed).toLocaleLowerCase();
  if (!accepted.some((item) => value.includes(item.toLocaleLowerCase()))) reasons.push({ field, rule: accepted.join(', '), observed });
}

function list(value) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : String(value ?? '').split(/,|;/).map((item) => item.trim()).filter(Boolean);
}

function observedText(opportunity) {
  return TEXT_FIELDS.map((field) => opportunity[field]).concat(opportunity.requirements, opportunity.description).flat().filter(Boolean).join(' ').toLocaleLowerCase();
}

function minimumSalary(filters) {
  return numericSalary(filters.minimumSalary ?? filters.salary);
}

function numericSalary(value) {
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}
