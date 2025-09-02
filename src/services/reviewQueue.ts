export interface ReviewItem { transcript: string; extractionJson: any; reason: string }
export async function enqueueForHumanReview(item: ReviewItem) {
  // TODO: DB/Queue/Slack entegrasyonu
  console.log("[HITL] queued", item.reason);
}