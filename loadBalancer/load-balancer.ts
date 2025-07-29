import express from 'express';
import { BEHttpClient } from "./utils/http-client";
import { Server, IncomingMessage, ServerResponse } from "http";

import { BEServerHealth, LbAlgorithm } from "./utils/enums";
import { BackendServerDetails, IBackendServerDetails } from "./backend-server-details";
import { ILbAlgorithm } from './lb-algorithms/lb-algo.interface'
import { LbAlgorithmFactory } from './lb-algorithms/lb-algos';
import { HealthCheck } from './utils/health-check';
import { Config } from './utils/config';

// [METRICS] Import metrics
import { requestCount, activeConnections, serverHealth, getMetrics, register } from './metrics/metrics'; // [METRICS]

// Check if Config is Valid
Config.validate();
const CONFIG = Config.getConfig();

export interface ILBServer {
    server: Server<typeof IncomingMessage, typeof ServerResponse>;
    algoType: LbAlgorithm;
    lbAlgo: ILbAlgorithm;
    hc: HealthCheck;
    backendServers: IBackendServerDetails[];
    getLBServer(): Server<typeof IncomingMessage, typeof ServerResponse>;
    close(): Server<typeof IncomingMessage, typeof ServerResponse>;
}

export class LBServer implements ILBServer {
    hc: HealthCheck;
    lbAlgo: ILbAlgorithm;
    algoType: LbAlgorithm;
    backendServers: IBackendServerDetails[];
    server: Server<typeof IncomingMessage, typeof ServerResponse>;

    private PORT: number;
    private backendServerUrls: string[];
    private reqAbortController: AbortController;
    private healthyServers: IBackendServerDetails[];

    constructor(port?: number) {
        this.PORT = port ?? CONFIG.lbPORT;
        this.algoType = CONFIG.lbAlgo;
        this.reqAbortController = new AbortController();
        this.healthyServers = [];
        this.backendServers = [];
        this.backendServerUrls = CONFIG.be_servers.map((e) => e.domain);

        CONFIG.be_servers.forEach((s) => {
            const beServer = new BackendServerDetails(s.domain, this.reqAbortController, s.weight);
            this.backendServers.push(beServer);
        });

        this.lbAlgo = LbAlgorithmFactory.factory(this.algoType, {
            curBEServerIdx: -1,
            allServers: this.backendServers,
            healthyServers: this.healthyServers
        });

        this.hc = new HealthCheck(this.backendServers, this.healthyServers);

        // Initialize server health metric values
        this.backendServers.forEach(server => {
            serverHealth.set({ target: server.url }, server.getStatus() === BEServerHealth.HEALTHY ? 1 : 0);
        });

        // Periodically update server health metrics every 5 seconds
        setInterval(() => {
            this.backendServers.forEach(server => {
                serverHealth.set({ target: server.url }, server.getStatus() === BEServerHealth.HEALTHY ? 1 : 0);
            });
        }, 5000);

        const app = this.createExpressApp();
        this.server = app.listen(this.PORT, () => {
            console.log('LB Server listening on port ' + this.PORT);
        });

        this.server.on('error', (err: Error) => {
            console.log('[GlobalErrorEvent] => Server on "error" event triggered');
            console.error(err);
        });

        this.server.on('close', () => {
            console.log('[GlobalCloseEvent] => Server on "close" event triggered');
        });

        this.hc.performHealthCheckOnAllServers();
        this.hc.startHealthCheck();
    }

    private createExpressApp() {
        const app = express();
        app.use(express.text());
        app.use(express.json());

        app.get('/', async (req: express.Request, res: express.Response) => {
            if (this.healthyServers.length === 0) {
                return res.sendStatus(500);
            }

            let backendServer: IBackendServerDetails | undefined;

            try {
                backendServer = this.getBackendServer();
                console.log(`\t[BEStart]  -  ${backendServer.url}`);
                
                const response = await BEHttpClient.get(backendServer.url, {
                    "axios-retry": {
                        retries: CONFIG.be_retries,
                        retryDelay: (retryCount) => retryCount * CONFIG.be_retry_delay,
                        onRetry: (retryCount, error, requestConfig) => {
                            console.log(`\t\t\t[BERetry]  -  retrying after delay ${backendServer!.url}`);

                            if (error.code === 'ECONNREFUSED') {
                                this.hc.performHealthCheck(backendServer!);
                            } else {
                                console.log(`${backendServer!.url} - retryCount=${retryCount} - error=${error}`);
                            }

                            backendServer = this.getBackendServer();
                            requestConfig.url = backendServer.url;
                        },
                    }
                });

                console.log(`\t[BESuccess]  -  ${backendServer.url}`);
                backendServer.incrementRequestsServedCount();
                return res.status(200).send(response.data);
            }
            catch (error) {
                console.log(`\t[BEError]  -  ${backendServer?.url ?? 'getBackendServer'}`);
                console.error(error);
                return res.sendStatus(500);
            }
        });

        // Metrics endpoint on the same port as LB server
        app.get('/metrics', async (_req, res) => {
            res.set('Content-Type', register.contentType);
            res.end(await getMetrics());
        });

        return app;
    }

    public getLBServer(): Server<typeof IncomingMessage, typeof ServerResponse> {
        return this.server;
    }

    public close(): Server<typeof IncomingMessage, typeof ServerResponse> {
        this.hc.stopHealthCheck();
        this.reqAbortController.abort();
        const server = this.server.close();
        console.log(`Closed LB Server`);
        this.printBackendStats();
        return server;
    }

    private printBackendStats(): void {
        console.log('Backend Stats: ');
        this.backendServers.forEach((server) => {
            const stat = [
                server.url,
                server.totalRequestsServedCount,
                server.requestsServedCount,
                server.getStatus()
            ];
            console.log(stat);
        });
    }

    private getBackendServer(): IBackendServerDetails {
        const { server } = this.lbAlgo.nextServer();
        return server;
    }
}
