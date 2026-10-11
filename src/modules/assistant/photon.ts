/** Client-safe entry points. Credentials and availability checks stay in server functions. */
export {
  getPhotonAvailability,
  getPhotonConnection,
  createPhotonLink,
  updatePhotonConnection,
} from "./messaging/messaging.functions";
