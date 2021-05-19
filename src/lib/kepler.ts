import { Serie, IArray } from "@youwol/dataframe"
import { BufferAttribute, BufferGeometry, TypedArray } from "three"



export function createBufferGeometry(
    {   positions, 
        indices 
    }: {
            positions: TypedArray, 
            indices: TypedArray 
        }
): BufferGeometry
{
    const geom = new BufferGeometry()

    geom.setAttribute('position', new BufferAttribute(positions, 3) )
    geom.setIndex(Array.from(indices))

    geom.computeVertexNormals()
    geom.computeBoundingBox()
    geom.computeBoundingSphere()
    return geom
}
