/** The mat. Light by default (editor); the public pages pass a dark green to match the theme. */
export function Tatami({ color = '#cbd5e1' }: { color?: string }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[600, 600]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}
