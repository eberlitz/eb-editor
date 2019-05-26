# eb-editor

Secure P2P Collaborative Markdown Editor in the Browser using WebRTC and Monaco Editor.

Still in development.

TODO:

- [x] Monaco Editor included
- [x] Basic WebRTC functionality based on peerjs
- [x] Syncronize text changes between multiple peers
- [x] Syncronize text selection between multiple peers
- [x] Syncronize cursor between multiple peers
- [ ] Dispose Cursor and Selection when the remote peer disconnects
- [ ] Network redistribution
- [ ] Update URL when originating peer leaves network. 
    - 1 node create the doc, another 2 connect to it, the original disconnect. the 2 remaingin must be connected and the url updated;
- [ ] When broadcasting peer originating operations, we can do it only when the target is different of the source. This will save bandwidth.
- [ ] Refactor code and write tests