export function buildSubmissionReview({ item = {}, snapshot = {}, resume = {}, answers = {}, attachments = [], decisions = [] } = {}) {
  return {
    company: item.company ?? '',
    role: item.role ?? item.title ?? '',
    platform: item.platform ?? '',
    url: snapshot.url ?? item.identifierOrUrl ?? '',
    jobId: snapshot.jobId ?? item.identifierOrUrl ?? '',
    resumePath: resume.path ?? '',
    resumeSha256: resume.sha256 ?? '',
    answers,
    attachments,
    decisions,
    observedFields: snapshot.fields ?? snapshot.dom?.fields ?? [],
    successText: false,
    createdAt: new Date().toISOString()
  };
}

export function reviewIdentity(review) {
  return [review.platform, review.jobId, review.url, review.resumeSha256].join('|');
}
