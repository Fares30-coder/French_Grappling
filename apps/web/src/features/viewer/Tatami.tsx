export function Tatami() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[600, 600]} />
      <meshStandardMaterial color="#cbd5e1" />
    </mesh>
  );
}
