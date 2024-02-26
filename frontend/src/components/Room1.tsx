import { useEffect, useRef, useState } from "react";
import { Socket, io } from "socket.io-client";
import { Navbar } from "./Navbar";

const URL = "http://localhost:3000";

export const Room = ({
    name,
    localAudioTrack,
    localVideoTrack,
    setJoined,
    darkMode,
    setDarkMode,
    toggleDarkMode
}: {
    name: string,
    localAudioTrack: MediaStreamTrack | null,
    localVideoTrack: MediaStreamTrack | null,
    setJoined: React.Dispatch<React.SetStateAction<boolean>>,
    darkMode: boolean,
    setDarkMode: React.Dispatch<React.SetStateAction<boolean>>,
    toggleDarkMode: () => void
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
    const [chatMessages, setChatMessages] = useState<string[][]>([]);
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
                setChatMessages(prevMessages => [[partnerName, e.data], ...prevMessages]);
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

    return (
        <div className={`flex flex-col h-screen ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-800'}`}>
        <Navbar darkMode={darkMode} toggleDarkMode={toggleDarkMode} name={name} />
        <div className={`bg-${darkMode ? 'gray-900' : 'gray-200'} text-${darkMode ? 'white' : 'black'} h-full flex flex-col items-center justify-center py-8`}>
            <div className="flex w-full">
                {/* Left Part */}
                <div className="flex-1 flex flex-col items-center justify-center">
                    <div className="w-3/4">
                        <video autoPlay width={400} height={400} ref={localVideoRef} className="m-2" />
                        {lobby && <p className="text-gray-500 text-sm">Waiting to connect you to someone</p>}
                        <video autoPlay width={400} height={400} ref={remoteVideoRef} className="m-2" />
                        <div className="flex mt-4">
                            <button onClick={() => {
                                if (socket) {
                                    handleLeave();
                                    socket.emit("leave");
                                }
                            }} className={`px-4 py-2 ${darkMode ? 'bg-blue-500' : 'bg-blue-600'} text-white rounded-md mr-4 ${darkMode ? 'hover:bg-blue-600' : 'hover:bg-blue-700'}`}>Skip</button>
                            <button onClick={() => {
                                if (socket) {
                                    handleLeave();
                                    socket.emit("close");
                                    setJoined(false);
                                }
                            }} className={`px-4 py-2 ${darkMode ? 'bg-red-500' : 'bg-red-600'} text-white rounded-md ${darkMode ? 'hover:bg-red-600' : 'hover:bg-red-700'}`}>Leave</button>
                        </div>
                    </div>
                </div>
                {/* Right Part */}
                <div className="flex-1 flex flex-col items-center justify-center">
                    <div className=" w-1/2 text-left">You are now chatting with {partnerName}</div>
                    <div className={`w-1/2 bg-${darkMode ? 'gray-700' : 'gray-100'} p-4 rounded-lg shadow-md h-[600px] overflow-y-auto flex flex-col-reverse`}>
                        {chatMessages.map((message, index) => {
                            if (message[0] === "You") {
                                return (
                                <div key={index} className="flex flex-col items-start mb-4">
                                    <div className="bg-blue-500 rounded-md p-2 text-white max-w-64 break-words min-w-16">
                                        {message[1]}
                                    </div>
                                    <div className="text-xs">{message[0]}</div>
                                </div>
                                );
                            } else {
                                return (
                                <div key={index} className="flex flex-col items-end mb-4">
                                    <div className={`bg-${darkMode ? 'gray-200' : 'white'} rounded-md p-2 text-gray-900 max-w-64 break-words min-w-16`}>
                                        {message[1]}
                                    </div>
                                    <div className="text-xs">{message[0]}</div>
                                </div>
                                );
                            }
                        })}
                    </div>
                    <div className="mt-4 w-1/2">
                        <input value={chat} placeholder="Message" onChange={(e) => setChat(e.target.value)} type="text" className={`w-full px-4 py-2 border ${darkMode ? 'border-gray-700 text-white bg-gray-700' : 'border-gray-300 bg-white'} rounded-md focus:outline-none`} />
                        <button onClick={() => {
                            if (sendingDc && chat.trim() !== "") {
                                setChatMessages(prevMessages => [["You", chat], ...prevMessages]);
                                sendingDc.send(chat);
                                setChat('');
                            }
                        }} className={`w-full mt-2 px-4 py-2 ${darkMode ? 'bg-green-500' : 'bg-green-600'} text-white rounded-md ${darkMode ? 'hover:bg-green-600' : 'hover:bg-green-700'}`}>Send</button>
                    </div>
                </div>
            </div>
        </div>
        </div>
    );
}

