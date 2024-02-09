import { useEffect, useRef, useState } from "react";
import { Socket, io } from "socket.io-client";

const URL = "http://localhost:3000";

export const Room = ({
    name,
    localAudioTrack,
    localVideoTrack,
    setJoined
}: {
    name: string,
    localAudioTrack: MediaStreamTrack | null,
    localVideoTrack: MediaStreamTrack | null,
    setJoined: React.Dispatch<React.SetStateAction<boolean>>
}) => {
    const [lobby, setLobby] = useState(true);
    const [socket, setSocket] = useState<null | Socket>(null);
    const [sendingPc, setSendingPc] = useState<null | RTCPeerConnection>(null);
    const [receivingPc, setReceivingPc] = useState<null | RTCPeerConnection>(null);
    const [remoteVideoTrack, setRemoteVideoTrack] = useState<MediaStreamTrack | null>(null);
    const [remoteAudioTrack, setRemoteAudioTrack] = useState<MediaStreamTrack | null>(null);
    const [remoteMediaStream, setRemoteMediaStream] = useState<MediaStream | null>(null);
    const [sendingDc, setSendingDc] = useState<RTCDataChannel | null>(null);
    const [receivingDc, setReceivingDc] = useState<RTCDataChannel | null>(null);
    const [chat, setChat] = useState<string>("");
    const [chatMessages, setChatMessages] = useState<string[]>([]);
    const [partnerName, setPartnerName] = useState<string>("");
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);

    function handleLeave() {
        if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
        }
        setLobby(true)
        sendingPc?.close();
        setSendingPc(pc => {
            if (pc) {
                pc.onicecandidate = null;
                pc.onnegotiationneeded = null;
            }

            return pc;
        })
        receivingPc?.close();
        setReceivingPc(pc => {
            if (pc) {
                pc.onicecandidate = null;
                pc.ontrack = null;
            }

            return pc;
        })
    }

    useEffect(() => {
        const socket = io(URL, {
            query: {
                "name": name
            }
        });
        socket.on('send-offer', async ({roomId} : {roomId: string}) => {
            console.log("sending offer");
            setLobby(false);
            const pc = new RTCPeerConnection();

            if (localVideoTrack) {
                console.error("added tack");
                console.log(localVideoTrack)
                pc.addTrack(localVideoTrack)
            }
            if (localAudioTrack) {
                console.error("added tack");
                console.log(localAudioTrack)
                pc.addTrack(localAudioTrack)
            }

            pc.onicecandidate = async (e) => {
                console.log("receiving ice candidate locally");
                if (e.candidate) {
                   socket.emit("add-ice-candidate", {
                    candidate: e.candidate,
                    type: "sender",
                    roomId
                   })
                }
            }

            pc.onnegotiationneeded = async () => {
                console.log("on negotiation neeeded, sending offer");
                const sdp = await pc.createOffer();
                //@ts-expect-ignore
                pc.setLocalDescription(sdp)
                socket.emit("offer", {
                    sdp,
                    roomId
                })
            }
            const dc = pc.createDataChannel("chat", { negotiated: true, id: 0 });
            setSendingDc(dc);
            setSendingPc(pc);
        });

        socket.on("offer", async ({roomId, sdp: remoteSdp, partnerName}) => {
            console.log("received offer");
            setPartnerName(partnerName);
            setLobby(false);
            const pc = new RTCPeerConnection();
            
            const stream = new MediaStream();
            setRemoteMediaStream(stream)
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = stream;
            }
            
            pc.ontrack = (e) => {
                alert("ontrack");
                console.error("inside ontrack");
                const {track, type} = e;
                if (type == 'audio') {
                    setRemoteAudioTrack(track);
                    // @ts-ignore
                    remoteVideoRef.current.srcObject.addTrack(track)
                } else {
                    setRemoteVideoTrack(track);
                    // @ts-ignore
                    remoteVideoRef.current.srcObject.addTrack(track)
                }
                //@ts-ignore
                remoteVideoRef.current.play();
            }

            pc.onicecandidate = async (e) => {
                if (!e.candidate) {
                    return;
                }
                console.log("omn ice candidate on receiving seide");
                if (e.candidate) {
                   socket.emit("add-ice-candidate", {
                    candidate: e.candidate,
                    type: "receiver",
                    roomId
                   })
                }
            }
            const dc = pc.createDataChannel("chat", { negotiated: true, id: 0 });
            console.log(partnerName);
            dc.onmessage = (e) => {
                setChatMessages(prevMessages => [...prevMessages, `${partnerName}: ${e.data}`]);
            }
            dc.onclose = function () { 
                setChatMessages([]);
             };
            
            pc.setRemoteDescription(remoteSdp)
            const sdp = await pc.createAnswer();
            pc.setLocalDescription(sdp)
            setReceivingDc(dc);
            setReceivingPc(pc);

            socket.emit("answer", {
                roomId,
                sdp: sdp
            });
        });

        socket.on("answer", ({roomId, sdp: remoteSdp}) => {
            setLobby(false);
            setSendingPc(pc => {
                pc?.setRemoteDescription(remoteSdp)
                return pc;
            });
            console.log("loop closed");
        })

        socket.on("lobby", () => {
            setLobby(true);
        })

        socket.on("add-ice-candidate", ({candidate, type}) => {
            console.log("add ice candidate from remote");
            console.log({candidate, type})
            if (type == "sender") {
                setReceivingPc(pc => {
                    if (!pc) {
                        console.error("receicng pc nout found")
                    } else {
                        console.error(pc.ontrack)
                    }
                    pc?.addIceCandidate(candidate)
                    return pc;
                });
            } else {
                setSendingPc(pc => {
                    if (!pc) {
                        console.error("sending pc nout found")
                    } else {
                        // console.error(pc.ontrack)
                    }
                    pc?.addIceCandidate(candidate)
                    return pc;
                });
            }
        });

        socket.on("leave", () => {
            handleLeave();
        })

        setSocket(socket)
    }, [name])

    useEffect(() => {
        if (localVideoRef.current) {
            if (localVideoTrack) {
                localVideoRef.current.srcObject = new MediaStream([localVideoTrack]);
                localVideoRef.current.play();
            }
        }
    }, [localVideoRef])

    return <div>
        Hi {name}
        <video autoPlay width={400} height={400} ref={localVideoRef} />
        {lobby ? "Waiting to connect you to someone" : null}
        <video autoPlay width={400} height={400} ref={remoteVideoRef} />
        <button onClick={() => {
            if (socket) {
                handleLeave();
                socket.emit("leave");
            }
        }}>Skip</button>
        <button onClick={() => {
            if (socket) {
                handleLeave();
                socket.emit("close");
                setJoined(false);
            }
        }}>Leave</button>

        <div>
            {chatMessages.map((message, index) => (
                <p key={index}>{message}</p>
            ))}
            <div>
                <input value={chat} onChange={(e) => setChat(e.target.value)} type="text"></input>
                <button onClick={() => {
                    if (sendingDc) {
                        setChatMessages(prevMessages => [...prevMessages, `${name}: ${chat}`]);
                        sendingDc.send(chat);
                        setChat('');
                    }
                }}>Send</button>
            </div>
        </div>
    </div>
}

