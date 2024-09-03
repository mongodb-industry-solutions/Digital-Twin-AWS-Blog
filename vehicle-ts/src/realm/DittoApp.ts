import { init, Ditto } from "@dittolive/ditto";
import { BSON } from "bson";

class DittoApp {
  private ditto: Ditto;
  private vehicle: any | null = null;
  private batteryMeasurements: Array<any> = [];
  private clients: Array<any> = [];

  constructor() {
    init();

    this.ditto = new Ditto({
      type: "onlinePlayground",
      appID: "", // Replace with your actual app ID
      token: "", // Replace with your actual token
    });
    this.ditto.disableSyncWithV3();
    this.ditto.startSync();
    this.initialize();
  }

  async initialize() {
    this.ditto.sync.registerSubscription(`
        SELECT * FROM vehicle 
    `);

    this.ditto.store.registerObserver(
      `
          SELECT *
          FROM vehicle
      `,
      (result: any) => {
        this.vehicle =
          result.items.map((doc: any) => {
            return doc.value;
          })[0] || null;

        this.notifyClients(this.vehicle);
      }
    );
    console.log("Connected to Ditto and listening for changes");
  }

  notifyClients(vehicle: any | null) {
    const data = vehicle ? JSON.stringify(vehicle) : "null";
    this.clients.forEach((client) => {
      client.write(`data: ${data}\n\n`);
    });
  }

  addClient(client: any) {
    this.clients.push(client);
    client.on("close", () => {
      this.clients = this.clients.filter((c) => c !== client);
    });
  }

  async addSensor(values: { voltage: string; current: string }) {
    const measurement = {
      ts: new Date(),
      voltage: Number(values.voltage),
      current: Number(values.current),
    };

    // if (this.vehicle) {
    //   try {
    //     await this.ditto.store.execute(
    //       `
    //       INSERT INTO vehicle
    //       DOCUMENTS (
    //         _id: :id,
    //         battery: {
    //           voltage: :voltage,
    //           current: :current
    //         }
    //       )
    //     `,
    //       {
    //         id: this.vehicle._id,
    //         voltage: measurement.voltage,
    //         current: measurement.current,
    //       }
    //     );
    //   } catch (err) {
    //     console.error("Error updating vehicle battery status in Ditto:", err);
    //   }
    // } else {
    //   console.error("Vehicle not found in Ditto store.");
    // }

    if (this.batteryMeasurements.length < 20) {
      this.batteryMeasurements.push(measurement);
    } else if (this.batteryMeasurements.length === 20) {
      try {
        const newSensor = {
          _id: new BSON.ObjectId().toString(),
          vin: this.vehicle._id,
          type: "battery",
          measurements: this.batteryMeasurements,
        };

        await this.ditto.store.execute(
          `
          INSERT INTO sensors
          DOCUMENTS (:newSensor)
        `,
          { newSensor }
        );

        console.log("Inserted the 20 readings of the sensor to Ditto");
        this.batteryMeasurements = [];
      } catch (err) {
        console.error("Error writing sensor data to Ditto:", err);
      }
    }

    return {
      result: `Battery status updated: voltage: ${values.voltage}, current: ${values.current}, Bucket: ${this.batteryMeasurements.length}/20`,
    };
  }

  async getVehicleAsJSON() {
    try {
      const queryResult = await this.ditto.store.execute(
        `
        SELECT * FROM "vehicle" 
        `
      );

      if (queryResult.items.length > 0) {
        const vehicle = queryResult.items[0].value;
        //console.log(queryResult);
        return JSON.stringify(vehicle);
      } else {
        throw new Error("No vehicle data found");
      }
    } catch (error) {
      console.error("Error fetching vehicle data:", error);
      throw error;
    }
  }
}

export default DittoApp;
