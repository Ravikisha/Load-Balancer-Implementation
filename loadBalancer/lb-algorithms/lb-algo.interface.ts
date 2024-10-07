import { IBackendServerDetails } from "../backend-server-details";

// Load Balancer Algorithm Interface for Type Checking
export interface ILBAlgorithmParams {
  allServers: IBackendServerDetails[];

  healthyServers: IBackendServerDetails[];

  curBEServerIdx?: number;
}

// Load Balancer Algorithm Abstract Class for Object Creation
export abstract class ILbAlgorithm {
  abstract allServers: IBackendServerDetails[];
  abstract healthyServers: IBackendServerDetails[];
  abstract curBEServerIdx: number;

  abstract nextServer(): { server: IBackendServerDetails; serverIdx: number };
}
