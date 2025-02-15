/* eslint-env mocha */

import { expect } from 'aegir/chai'
import { multiaddr } from '@multiformats/multiaddr'
import { pipe } from 'it-pipe'
import all from 'it-all'
import { fromString } from 'uint8arrays/from-string'
import { mockRegistrar, mockUpgrader } from '@libp2p/interface-mocks'
import type { Transport, Upgrader } from '@libp2p/interface-transport'
import type { Uint8ArrayList } from 'uint8arraylist'
import type { Source } from 'it-stream-types'

// this node is started in aegir.cjs before the test run
const REMOTE_MULTIADDR_IP4 = multiaddr('/ip4/127.0.0.1/tcp/12345/http/p2p-webrtc-direct')
const REMOTE_MULTIADDR_IP6 = multiaddr('/ip6/::1/tcp/12346/http/p2p-webrtc-direct')
const ECHO_PROTOCOL = '/echo/1.0.0'

async function * toBytes (source: Source<Uint8ArrayList>) {
  for await (const list of source) {
    yield * list
  }
}

export default (create: () => Promise<Transport>) => {
  describe('dial', function () {
    this.timeout(20 * 1000)

    let upgrader: Upgrader

    beforeEach(() => {
      const protocol = '/echo/1.0.0'
      const registrar = mockRegistrar()
      void registrar.handle(protocol, ({ stream }) => {
        void pipe(
          stream,
          stream
        )
      })
      upgrader = mockUpgrader({
        registrar
      })
    })

    it('dial on IPv4', async () => {
      const wd = await create()
      const conn = await wd.dial(REMOTE_MULTIADDR_IP4, { upgrader })
      const stream = await conn.newStream(ECHO_PROTOCOL)
      const data = fromString('some data')

      const values = await pipe(
        [data],
        stream,
        toBytes,
        async (source) => await all(source)
      )

      expect(values).to.deep.equal([data])
      await conn.close()
    })

    it('dials the same server twice', async () => {
      const wd = await create()
      const conn1 = await wd.dial(REMOTE_MULTIADDR_IP4, { upgrader })
      const conn2 = await wd.dial(REMOTE_MULTIADDR_IP4, { upgrader })

      const values = await Promise.all(
        [conn1, conn2].map(async conn => {
          const stream = await conn1.newStream(ECHO_PROTOCOL)
          const data = fromString('some data ' + conn.id)

          const values = await pipe(
            [data],
            stream,
            toBytes,
            async (source) => await all(source)
          )

          return values
        })
      )

      expect(values).to.deep.equal([[
        fromString('some data ' + conn1.id)
      ], [
        fromString('some data ' + conn2.id)
      ]])

      await conn1.close()
      await conn2.close()
    })

    it('dial offline / non-existent node on IPv4, check callback', async () => {
      const wd = await create()
      const maOffline = multiaddr('/ip4/127.0.0.1/tcp/55555/http/p2p-webrtc-direct')

      await expect(wd.dial(maOffline, { upgrader })).to.eventually.be.rejected()
    })

    it('dial on IPv6', async () => {
      const wd = await create()
      const conn = await wd.dial(REMOTE_MULTIADDR_IP6, { upgrader })
      const stream = await conn.newStream(['/echo/1.0.0'])
      const data = fromString('some data')

      const values = await pipe(
        [data],
        stream,
        toBytes,
        async (source) => await all(source)
      )

      expect(values).to.deep.equal([data])
      await conn.close()
    })
  })
}
