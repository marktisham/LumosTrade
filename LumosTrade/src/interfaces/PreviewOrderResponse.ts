export class PreviewOrderResponse {
  PreviewID: number;
  EstimatedOrderAmount: number;

  constructor(PreviewID: number, EstimatedOrderAmount: number) {
    this.PreviewID = PreviewID;
    this.EstimatedOrderAmount = EstimatedOrderAmount;

    if (this.PreviewID == null || this.PreviewID < 0) {
      throw new Error(`PreviewID must be a non-negative number. Got ${this.PreviewID}`);
    }

    if (this.EstimatedOrderAmount == null || this.EstimatedOrderAmount < 0) {
      throw new Error(`EstimatedOrderAmount must be a non-negative number. Got ${this.EstimatedOrderAmount}`);
    }
  }
}
