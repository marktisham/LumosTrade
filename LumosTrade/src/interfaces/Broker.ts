export class Broker {
  public BrokerID: number;
  public Name: string;

  constructor(BrokerID: number, Name: string) {
    this.BrokerID = BrokerID;
    this.Name = Name;
  }
}

export default Broker;
