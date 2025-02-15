import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import mediasoup from "mediasoup";
const app = express();
const port = 4000;
const server = http.createServer(app);
app.use(cors({
    origin: "*",
    credentials: true,
}));
const io = new Server(server, {
    cors: {
        origin: "*",
        credentials: true,
    },
});
const peers = io.of("/mediasoup");
let worker;
let router;
let producerTransport;
let consumerTransport;
let producer;
let consumer;
const createWorker = async () => {
    const newWorker = await mediasoup.createWorker({
        rtcMinPort: 2000, // Minimum port number for RTC traffic
        rtcMaxPort: 2020, // Maximum port number for RTC traffic
    });
    console.log(`Worker process ID ${newWorker.pid}`);
    newWorker.on("died", (error) => {
        console.error("mediasoup worker has died");
        // Gracefully shut down the process to allow for recovery or troubleshooting.
        setTimeout(() => {
            process.exit();
        }, 2000);
    });
    return newWorker;
};
const mediaCodecs = [
    {
        kind: "audio",
        mimeType: "audio/opus",
        clockRate: 48000,
        channels: 2,
        preferredPayloadType: 96,
        rtcpFeedback: [{ type: "nack" }, { type: "nack", parameter: "pli" }],
    },
    {
        kind: "video",
        mimeType: "video/VP8",
        clockRate: 90000,
        parameters: {
            "x-google-start-bitrate": 1000,
        },
        preferredPayloadType: 97,
        rtcpFeedback: [
            { type: "nack" },
            { type: "ccm", parameter: "fir" },
            { type: "goog-remb" },
        ],
    },
];
peers.on("connection", async (socket) => {
    // Create and initialize the mediasoup Worker.
    worker = await createWorker();
    console.log(`Peer connected: ${socket.id}`);
    socket.emit("connection-success", { socketId: socket.id });
    socket.on("disconnect", () => {
        console.log("Peer disconnected");
    });
    router = await worker.createRouter({
        mediaCodecs: mediaCodecs,
    });
    socket.on("getRouterRtpCapabilities", (callback) => {
        const routerRtpCapabilities = router.rtpCapabilities;
        callback({ routerRtpCapabilities });
    });
    socket.on("createTransport", async ({ sender }, callback) => {
        if (sender) {
            producerTransport = await createWebRtcTransport(callback);
        }
        else {
            consumerTransport = await createWebRtcTransport(callback);
        }
    });
    socket.on("connectProducerTransport", async ({ dtlsParameters }) => {
        await (producerTransport === null || producerTransport === void 0 ? void 0 : producerTransport.connect({ dtlsParameters }));
    });
    socket.on("transport-produce", async ({ kind, rtpParameters }, callback) => {
        producer = await (producerTransport === null || producerTransport === void 0 ? void 0 : producerTransport.produce({
            kind,
            rtpParameters,
        }));
        producer === null || producer === void 0 ? void 0 : producer.on("transportclose", () => {
            console.log("Producer transport closed");
            producer === null || producer === void 0 ? void 0 : producer.close();
        });
        callback({ id: producer === null || producer === void 0 ? void 0 : producer.id });
    });
    socket.on("connectConsumerTransport", async ({ dtlsParameters }) => {
        await (consumerTransport === null || consumerTransport === void 0 ? void 0 : consumerTransport.connect({ dtlsParameters }));
    });
    socket.on("consumeMedia", async ({ rtpCapabilities }, callback) => {
        try {
            if (producer) {
                if (!router.canConsume({ producerId: producer === null || producer === void 0 ? void 0 : producer.id, rtpCapabilities })) {
                    console.error("Cannot consume");
                    return;
                }
                console.log("-------> consume");
                consumer = await (consumerTransport === null || consumerTransport === void 0 ? void 0 : consumerTransport.consume({
                    producerId: producer === null || producer === void 0 ? void 0 : producer.id,
                    rtpCapabilities,
                    paused: (producer === null || producer === void 0 ? void 0 : producer.kind) === "video",
                }));
                consumer === null || consumer === void 0 ? void 0 : consumer.on("transportclose", () => {
                    console.log("Consumer transport closed");
                    consumer === null || consumer === void 0 ? void 0 : consumer.close();
                });
                consumer === null || consumer === void 0 ? void 0 : consumer.on("producerclose", () => {
                    console.log("Producer closed");
                    consumer === null || consumer === void 0 ? void 0 : consumer.close();
                });
                callback({
                    params: {
                        producerId: producer === null || producer === void 0 ? void 0 : producer.id,
                        id: consumer === null || consumer === void 0 ? void 0 : consumer.id,
                        kind: consumer === null || consumer === void 0 ? void 0 : consumer.kind,
                        rtpParameters: consumer === null || consumer === void 0 ? void 0 : consumer.rtpParameters,
                    },
                });
            }
        }
        catch (error) {
            console.error("Error consuming:", error);
            callback({
                params: {
                    error,
                },
            });
        }
    });
    socket.on("resumePausedConsumer", async () => {
        console.log("consume-resume");
        await (consumer === null || consumer === void 0 ? void 0 : consumer.resume());
    });
});
const createWebRtcTransport = async (callback) => {
    try {
        const webRtcTransportOptions = {
            listenIps: [
                {
                    ip: "127.0.0.1",
                },
            ],
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
        };
        const transport = await router.createWebRtcTransport(webRtcTransportOptions);
        console.log(`Transport created: ${transport.id}`);
        transport.on("dtlsstatechange", (dtlsState) => {
            if (dtlsState === "closed") {
                transport.close();
            }
        });
        transport.on("@close", () => {
            console.log("Transport closed");
        });
        callback({
            params: {
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters,
            },
        });
        return transport;
    }
    catch (error) {
        console.log(error);
        callback({
            params: {
                error,
            },
        });
    }
};
server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
//# sourceMappingURL=index.js.map