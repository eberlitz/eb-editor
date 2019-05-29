# eb-editor

Secure P2P Collaborative Markdown Editor in the Browser using WebRTC and Monaco Editor.

Still in development. For now, you can run it with `npm run server`.

TODO:

- [x] Monaco Editor included
- [x] Basic WebRTC functionality based on peerjs
- [x] Syncronize text changes between multiple peers
- [x] Syncronize text selection between multiple peers
- [x] Syncronize cursor between multiple peers
- [x] Update URL when originating peer leaves network. 
    - 1 node create the doc, another 2 connect to it, the original disconnect. the 2 remaingin must be connected and the url updated;
- [x] Dispose Cursor and Selection when the remote peer disconnects
- [ ] Refactor code and write tests
- [ ] Change peer to a connection broker based on "filepaths" instead of peerIds